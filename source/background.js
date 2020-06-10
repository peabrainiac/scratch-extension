chrome.runtime.onMessage.addListener(receiveMessage);
chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.alarms.onAlarm.addListener(onAlarm);
var userData = {};
var themeSettings;
function init(){
	chrome.alarms.create("refresh",{periodInMinutes:2});
	refreshMessageCount();
}
function onAlarm(alarm){
	if (alarm.name=="refresh"){
		refreshMessageCount();
	}
}
function receiveMessage(message,sender,sendResponse){
	if (message.action=="getData"){
		getUnreadMessages();
	}else if (message.action=="clearProjectsList"){
		ScratchAPI.clearProjectCache();
	}else if (message.action=="getProjectData"){
		getProjectData(message.data.id);
	}else if (message.action=="clearUnreadMessages"){
		clearUnreadMessages();
	}else if (message.action=="postComment"){
		postComment(message.data);
	}else if (message.action=="getThemeSettings"){
		if (themeSettings){
			sendResponse(themeSettings);
		}else{
			chrome.storage.local.get("themeSettings",function(response){
				themeSettings = response.themeSettings||{darkThemeEnabled:false};
				sendResponse(themeSettings);
			});
		}
		return true;
		/*return new Promise(function(resolve,reject){
			if (themeSettings){
				resolve(themeSettings);
			}else{
				chrome.storage.local.get("themeSettings",function(response){
					themeSettings = response.themeSettings||{darkThemeEnabled:false};
					resolve(themeSettings);
				});
			}
		});*/
	}else if (message.action=="setThemeSettings"){
		themeSettings = message.settings;
		chrome.storage.local.set({themeSettings:message.settings});
	}
}
function refreshMessageCount(){
	ScratchAPI.getMessageCount(function(response){
		if (response.msg_count!==undefined){
			displayMessageCount(response.msg_count);
		}else{
			console.log("Error on getting message count: "+(response.err||"No response from scratch servers"));
			displayOfflineSymbol();
		}
	});
}
function getUnreadMessages(){
	ScratchAPI.getSessionData(onSessionData);
	function onSessionData(response){
		if (!response||!response.user){
			displayOfflineSymbol();
			sendMessageData({err:response.err||"Can't get session data"});
		}else{
			var username = response.user.username;
			Debug.log("session response:",response);
			loadUserData(username,function(result){
				userData = result||{username:username};
				userData.userID = response.user.id;
				userData.userImg = "https:"+response.user.thumbnailUrl
				userData.token = response.user.token;
				ScratchAPI.getMessageCount(onMessageCount);
			});
		}
	}
	function onMessageCount(response){
		if (response.msg_count==undefined){
			sendMessageData({err:response.err||"Error getting message count"});
		}else{
			var msg_count = response.msg_count;
			displayMessageCount(msg_count);
			userData.cache = userData.cache||{};
			userData.cache.unread = userData.cache.unread||[];
			userData.cache.lastID;
			ScratchAPI.getMessages(0,msg_count,userData.cache.lastID,userData.username,userData.token,sendProgress,function(messages){
				Debug.log("messages retrieved:",messages);
				if (messages.length==msg_count){
					userData.cache.unread = messages;
					Debug.log("loaded none from cache; message "+userData.cache.lastID+" not found!");
				}else{
					userData.cache.unread = messages.concat(userData.cache.unread);
					Debug.log("loaded "+(userData.cache.unread.length-messages.length)+" from cache, "+messages.length+" from server");
				}
				if (userData.cache.unread.length>0){
					userData.cache.lastID = userData.cache.unread[0].id;
				}
				saveUserData(userData,function(){
					processMessages(userData.cache.unread);
				});
			});
		}
	}
	function sendProgress(progress){
		chrome.runtime.sendMessage({action:"showProgress",progress:progress});
	}
	function processMessages(messages){
		var msgData = {};
		for (let i=0;i<messages.length;i++){
			var msg = messages[i];
			if (msg.type=="followuser"){
				msgData.follows = msgData.follows||[];
				msgData.follows.push(msg.actor_username);
			}else if(msg.type=="curatorinvite"){
				msgData.invites = msgData.invites||[];
				msgData.invites.push({title:msg.title,user:msg.actor_username,studioID:msg.gallery_id});
			}else if(msg.type=="loveproject"||msg.type=="favoriteproject"||msg.type=="remixproject"||(msg.type=="addcomment"&&msg.comment_type==0)){
				msgData.projects = msgData.projects||{ids:[]};
				var projectID = msg.parent_id||msg.project_id||msg.comment_obj_id;
				var projectTitle = msg.parent_title||msg.title||msg.project_title||msg.comment_obj_title;
				var project = msgData.projects[projectID];
				if (!project){
					project = {title:projectTitle,id:projectID,loves:[],favs:[],comments:[],remixes:[]};
					msgData.projects.ids.push(projectID);
					msgData.projects[projectID] = project;
				}
				if (msg.type=="loveproject"){
					project.loves.push(msg.actor_username);
				}else if (msg.type=="favoriteproject"){
					project.favs.push(msg.actor_username);
				}else if (msg.type=="addcomment"){
					project.comments.push({user:msg.actor_username,id:msg.comment_id,comment:msg.comment_fragment});
				}else if (msg.type=="remixproject"){
					project.remixes.push({user:msg.actor_username,id:msg.project_id,title:msg.title});
				}
			}else if(msg.type=="studioactivity"){
				msgData.studios = msgData.studios||{ids:[]};
				if (!msgData.studios[msg.gallery_id]){
					msgData.studios.ids.push(msg.gallery_id);
					msgData.studios[msg.gallery_id] = {title:msg.title,id:msg.gallery_id};
				}
			}else if(msg.type=="addcomment"&&msg.comment_type==1){
				msgData.comments = msgData.comments||{};
				var username = msg.comment_obj_title;
				var comment = {user:msg.actor_username,id:msg.comment_id,comment:msg.comment_fragment};
				if (username==userData.username){
					msgData.comments.ownProfile = msgData.comments.ownProfile||[];
					msgData.comments.ownProfile.push(comment);
					msgData.comments.ownProfileID = userData.username;
				}else{
					msgData.comments.profiles = msgData.comments.profiles||[];
					msgData.comments.profileComments = msgData.comments.profileComments||{};
					if (!msgData.comments.profileComments[username]){
						msgData.comments.profiles.push(username);
						msgData.comments.profileComments[username] = [];
					}
					msgData.comments.profileComments[username].push(comment);
				}
			}else{
				console.log("unknown message type:",msg);
			}
		}
		msgData.user = {name:userData.username,id:userData.userID,userImg:userData.userImg};
		getCommentsData(msgData);
		sendMessageData(msgData);
	}
	function getCommentsData(msgData){
		if (msgData.projects){
			for (let i=0;i<msgData.projects.ids.length;i++){
				var projectID = msgData.projects.ids[i];
				var project = msgData.projects[projectID];
				if (!(project.loves.length>0||project.favs.length>0||project.remixes.length>0)){
					msgData.projects[projectID] = undefined;
					msgData.projects.ids.splice(i,1);
					msgData.comments = msgData.comments||{};
					msgData.comments.projects = msgData.comments.projects||{ids:[]};
					msgData.comments.projects.ids.push(projectID);
					msgData.comments.projects[projectID] = project;
					i--;
				}
			}
		}
		if (msgData.comments){
			if (msgData.comments.ownProfile){
				getCommentsFromPage(msgData.comments.ownProfile,{type:"profile",user:userData.username});
			}
			if (msgData.comments.profiles){
				for (let i=0;i<msgData.comments.profiles.length;i++){
					var user = msgData.comments.profiles[i];
					getCommentsFromPage(msgData.comments.profileComments[user],{type:"profile",user:user});
				}
			}
			if (msgData.comments.projects){
				for (let i=0;i<msgData.comments.projects.ids.length;i++){
					var id = msgData.comments.projects.ids[i];
					getCommentsFromPage(msgData.comments.projects[id].comments,{type:"project",id:id});
				}
			}
		}
		if (msgData.projects){
			for (let i=0;i<msgData.projects.ids.length;i++){
				var projectID = msgData.projects.ids[i];
				var project = msgData.projects[projectID];
				if (project.comments.length>0){
					getCommentsFromPage(project.comments,{type:"project",id:projectID});
				}
			}
		}
	}
	function sendMessageData(data){
		chrome.runtime.sendMessage({action:"messageDataDone",data:data});
	}
}
function getCommentsFromPage(commentsList,obj){
	ScratchAPI.getCommentsFromPage(obj.type,obj.user||obj.id,commentsList,function(commentThreads){
		var identifier = "unread-comments-"+((obj.type=="profile")?((obj.user==userData.username)?"ownprofile":("profile-"+obj.user)):("project-"+obj.id));
		chrome.runtime.sendMessage({action:"gotMoreData",identifier:identifier,data:commentThreads});
	});
}
function getProjectData(id){
	ScratchAPI.getProjectData(id,function(data){
		chrome.runtime.sendMessage({action:"gotMoreData",identifier:"data-project-"+id,data:data});
	});
}
function postComment(args){
	chrome.cookies.get({url:"https://scratch.mit.edu/",name:"scratchcsrftoken"},function(tokenCookie){
		var token = tokenCookie.value;
		ScratchAPI.postComment(args.url,args.text,args.thread,args.parent,token,function(postedComment){
			var data = postedComment||{error:true};
			chrome.runtime.sendMessage({action:"gotMoreData",data:data,identifier:"comment-response-"+args.thread+"-"+args.parent});
		});
	});
}
function clearUnreadMessages(){
	chrome.cookies.get({url:"https://scratch.mit.edu/",name:"scratchcsrftoken"},function(tokenCookie){
		var token = tokenCookie.value;
		ScratchAPI.clearUnreadMessages(token);
	});
}
function onClearedMessages(){
	chrome.runtime.sendMessage({action:"clearedUnreadMessages"});
}
function saveUserData(userData,callback){
	var temp = {};
	temp["userdata_"+userData.username] = userData;
	chrome.storage.local.set(temp,callback);
}
function loadUserData(username,callback){
	var key = "userdata_"+username;
	chrome.storage.local.get(key,function(result){
		callback(result[key]);
	});
}
function displayMessageCount(count){
	chrome.browserAction.setBadgeText({text:""+(count||"")});
	chrome.browserAction.setBadgeBackgroundColor({color:[255,Math.floor(100+75*50/(50+count)),0,255]});
	chrome.browserAction.setIcon({path:"favicon.png"});
	if (chrome.browserAction.setBadgeTextColor){
		chrome.browserAction.setBadgeTextColor({color:"#ffffff"});
	}
}
function displayOfflineSymbol(){
	chrome.browserAction.setBadgeText({text:""});
	chrome.browserAction.setIcon({path:"favicon_offline.png"});
}