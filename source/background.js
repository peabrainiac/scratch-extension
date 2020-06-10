chrome.runtime.onMessage.addListener(receiveMessage);
chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
chrome.alarms.onAlarm.addListener(onAlarm);
var userData = {};
var projects;
function init(){
	chrome.alarms.create("refresh",{periodInMinutes:2});
	refreshMessageCount();
}
function onAlarm(alarm){
	if (alarm.name=="refresh"){
		refreshMessageCount();
	}
}
function receiveMessage(message){
	if (message.action=="getData"){
		getUnreadMessages();
	}else if (message.action=="clearProjectsList"){
		projects = {ids:[],nextPage:0,loading:false,requested:[]};
	}else if (message.action=="getProjectStats"){
		getProjectStats(message.data);
	}else if (message.action=="clearUnreadMessages"){
		clearUnreadMessages();
	}else if (message.action=="postComment"){
		postComment(message.data);
	}
}
function refreshMessageCount(){
	getJson("https://scratch.mit.edu/messages/ajax/get-message-count/",function(response){
		if (response.msg_count!==undefined){
			displayMessageCount(response.msg_count);
		}else{
			console.log("Error on getting message count: "+(response.err||"No response from scratch servers"));
			displayOfflineSymbol();
		}
	});
}
function getUnreadMessages(){
	getJson("https://scratch.mit.edu/session/",onSessionData,true);
	function onSessionData(response){
		if (!response||!response.user){
			displayOfflineSymbol();
			sendMessageData({err:response.err||"Can't get session data"});
		}else{
			var username = response.user.username;
			//console.log("session response:",response);
			loadUserData(username,function(result){
				userData = result||{username:username};
				userData.userID = response.user.id;
				userData.userImg = "https:"+response.user.thumbnailUrl
				userData.token = response.user.token;
				getJson("https://scratch.mit.edu/messages/ajax/get-message-count/",onMessageCount);
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
			loadMessages(0,msg_count,userData.cache.lastID,sendProgress,function(messages){
				//console.log("messages retrieved:",messages);
				if (messages.length==msg_count){
					userData.cache.unread = messages;
					//console.log("loaded none from cache; message "+userData.cache.lastID+" not found!");
				}else{
					userData.cache.unread = messages.concat(userData.cache.unread);
					//console.log("loaded "+(userData.cache.unread.length-messages.length)+" from cache, "+messages.length+" from server");
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
	function loadMessages(start,amount,lastID,progress,callback){
		var offset = start;
		var remaining = amount;
		var messagesURL = "https://api.scratch.mit.edu/users/"+userData.username+"/messages";
		var messages = new Array(amount);
		var nextBundleLength;
		nextMessageBundle([]);
		function nextMessageBundle(bundle){
			var foundLastMessage = false;
			for (let i=0;i<bundle.length&&!foundLastMessage;i++){
				if (bundle[i].id!=lastID){
					messages[offset+i] = bundle[i];
				}else{
					foundLastMessage = true;
					messages = messages.slice(0,offset+i);
				}
			}
			offset += bundle.length;
			remaining -= bundle.length;
			if (bundle.length<nextBundleLength||remaining==0||foundLastMessage){
				callback(messages);
			}else{
				nextBundleLength = Math.min(remaining,40);
				sendProgress(Math.max(1,(remaining+nextBundleLength)/amount));
				getJson(messagesURL+"?limit="+nextBundleLength+"&offset="+offset,nextMessageBundle,false,true);
			}
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
					project = {title:projectTitle,id:projectID};
					msgData.projects.ids.push(projectID);
					msgData.projects[projectID] = project;
				}
				if (msg.type=="loveproject"){
					project.loves = project.loves||[];
					project.loves.push(msg.actor_username);
				}
				if (msg.type=="favoriteproject"){
					project.favs = project.favs||[];
					project.favs.push(msg.actor_username);
				}
				if (msg.type=="addcomment"){
					project.comments = project.comments||[];
					project.comments.push({user:msg.actor_username,id:msg.comment_id,comment:msg.comment_fragment});
				}
				if (msg.type=="remixproject"){
					project.remixes = project.remixes||[];
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
				if (!(project.loves||project.favs||project.remixes)){
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
				if (project.comments){
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
	var nextPage = 1;
	var commentThreadsGot = [];
	var remainingIDs = new Array(commentsList.length);
	for (let i=0;i<commentsList.length;i++){
		remainingIDs[i] = commentsList[i].id;
	}
	getNextPage();
	function getNextPage(){
		if (remainingIDs.length>0){
			var url = "https://scratch.mit.edu/site-api/comments/"+((obj.type=="profile")?("user/"+obj.user):("project/"+obj.id))+"/?page="+nextPage;
			sendServerRequest(url,onCommentPage,{type:"document"});
		}else{
			var identifier = "unread-comments-"+((obj.type=="profile")?((obj.user==userData.username)?"ownprofile":("profile-"+obj.user)):("project-"+obj.id));
			chrome.runtime.sendMessage({action:"gotMoreData",identifier:identifier,data:commentThreadsGot});
		}
		/*if (obj.type=="profile"){
			if (remainingIDs.length>0){
				sendServerRequest("https://scratch.mit.edu/site-api/comments/user/"+obj.user+"/?page="+nextPage,onCommentPage,{type:"document"});
			}else{
				var identifier = "unread-comments-"+((obj.user==userData.username)?"ownprofile":("profile-"+obj.user));
				chrome.runtime.sendMessage({action:"gotCommentsData",identifier:identifier,data:commentThreadsGot});
			}
		}else if (obj.type=="project"){
			if (remainingIDs.length>0){
				sendServerRequest("https://scratch.mit.edu/site-api/comments/project/"+obj.id+"/?page="+nextPage,onCommentPage,{type:"document"});
			}else{
				var identifier = "unread-comments-project-"+obj.id;
				chrome.runtime.sendMessage({action:"gotCommentsData",identifier:identifier,data:commentThreadsGot});
			}
		}*/
	}
	function onCommentPage(response){
		for (let i=0;i<remainingIDs.length;i++){
			var currentID = remainingIDs[i];
			var element = response.getElementById("comments-"+currentID);
			if (element){
				var container = element.parentElement;
				if (container.className!="top-level-reply"){
					container = container.parentElement.parentElement;
				}
				var commentElements = container.getElementsByClassName("comment");
				var commentThread = [];
				for (let j=0;j<commentElements.length;j++){
					var comment = commentElementToJson(commentElements[j]);
					commentThread.push(comment);
					for (let k=0;k<remainingIDs.length;k++){
						if (remainingIDs[k]==comment.id){
							comment.isNew = true;
							remainingIDs.splice(k,1);
							k--;
						}
					}
				}
				i--;
				commentThreadsGot.push(commentThread);
			}
		}
		nextPage++;
		getNextPage();
	}
}
function commentElementToJson(element){
	var comment = {};
	comment.id = element.getAttribute("data-comment-id");
	comment.user = element.getElementsByClassName("name")[0].children[0].firstChild.data;
	comment.userImg = element.getElementsByClassName("avatar")[0].src;
	comment.content = commentTextToJson(element.getElementsByClassName("content")[0]);
	comment.date = element.getElementsByClassName("time")[0].firstChild.data;
	comment.timestamp = element.getElementsByClassName("time")[0].getAttribute("title");
	comment.isNew = false;
	comment.reply = {};
	comment.reply.threadID = (element.getElementsByClassName("reply")[0].getAttribute("data-parent-thread")*1)||"";
	comment.reply.userID = (element.getElementsByClassName("reply")[0].getAttribute("data-commentee-id")*1)||"";
	comment.reply.user = comment.user;
	return comment;
}
function commentTextToJson(element){
	var data = [];
	for (let i=0;i<element.childNodes.length;i++){
		var node = element.childNodes[i];
		if (node.nodeType==3){
			data.push({type:"text",text:node.data});
		}else if (node.nodeType==1&&node.tagName=="A"){
			data.push({type:"link",text:node.firstChild.data,href:node.href});
		}
	}
	return data;
}
function getProjectStats(data){
	if (projects[data.id]){
		chrome.runtime.sendMessage({action:"gotMoreData",identifier:"stats-project-"+data.id,data:projects[data.id]});
	}else if(projects.nextPage==-1){
		console.log("Can't get project stats data "+data.id);
	}else{
		projects.requested.push(data);
		if (!projects.loading){
			projects.loading = true;
			var url = "https://scratch.mit.edu/site-api/projects/all/";
			if (projects.nextPage!=0){
				url += "?page="+projects.nextPage;
			}
			getJson(url,function(response){
				projects.nextPage++;
				if (response.length<40){
					projects.nextPage = -1;
				}
				projects.loading = false;
				for (let i=0;i<response.length;i++){
					var project = response[i].fields;
					var id = response[i].pk;
					projects.ids.push(id);
					projects[id] = {id:id,shared:project.isPublished,loves:project.love_count,favs:project.favorite_count,views:project.view_count,remixes:project.remixers_count};
				}
				var requested = projects.requested;
				projects.requested = [];
				for (let i=0;i<requested.length;i++){
					getProjectStats(requested[i]);
				}
			});
		}
	}
}
var requests = (function(){
	var exports = {};
	exports.onMessageClear = function(request){
		if (!hasReferer(request)){
			request.requestHeaders.push({name:"Referer",value:"https://scratch.mit.edu/messages/"});
		}
		onClearedMessages();
		return {requestHeaders:request.requestHeaders};
	}
	exports.onAddProfileComment = function(request){
		if (!hasReferer(request)){
			var profile;
			var temp = request.url.split("/");
			for (let i=0;i<temp.length&&!profile;i++){
				if (temp[i]=="user"){
					profile = temp[i+1];
				}
			}
			var referer = "https://scratch.mit.edu/user/"+profile+"/";
			request.requestHeaders.push({name:"Referer",value:referer});
		}
		return {requestHeaders:request.requestHeaders};
	}
	exports.onAddProjectComment = function(request){
		if (!hasReferer(request)){
			var id;
			var temp = request.url.split("/");
			for (let i=0;i<temp.length&&!id;i++){
				if (temp[i]=="project"){
					id = temp[i+1];
				}
			}
			var referer = "https://scratch.mit.edu/project/"+id+"/";
			request.requestHeaders.push({name:"Referer",value:referer});
		}
		return {requestHeaders:request.requestHeaders};
	}
	function hasReferer(request){
		var gotRef = false;
		for (let i=0,l=request.requestHeaders.length;i<l;i++){
			if (request.requestHeaders[i].name=="Referer"){
				gotRef = true;
			}
		}
		return gotRef;
	}
	return exports;
})();
chrome.webRequest.onBeforeSendHeaders.addListener(requests.onMessageClear,{urls:["https://scratch.mit.edu/site-api/messages/messages-clear/"]},["blocking","requestHeaders"]);
chrome.webRequest.onBeforeSendHeaders.addListener(requests.onAddProfileComment,{urls:["https://scratch.mit.edu/site-api/comments/user/*/add/"]},["blocking","requestHeaders"]);
chrome.webRequest.onBeforeSendHeaders.addListener(requests.onAddProjectComment,{urls:["https://scratch.mit.edu/site-api/comments/project/*/add/"]},["blocking","requestHeaders"]);
function postComment(args){
	var data = '{"content":"'+args.text+'","parent_id":'+(args.thread||'""')+',"commentee_id":'+(args.parent||'""')+'}';
	chrome.cookies.get({url:"https://scratch.mit.edu/",name:"scratchcsrftoken"},function(tokenCookie){
		var token = tokenCookie.value;
		sendServerRequest(args.url,function(response){
			//console.log("comment response:",response);
			var data = {};
			if ((response instanceof HTMLDocument)&&(response.getElementsByClassName("comment").length>0)){
				var commentElement = response.getElementsByClassName("comment")[0];
				data = commentElementToJson(commentElement);
			}else{
				data.error = true;
			}
			chrome.runtime.sendMessage({action:"gotMoreData",data:data,identifier:"comment-response-"+args.thread+"-"+args.parent});
		},{includeXRequestedWith:true,csrfToken:token,requestType:"POST",data:data,type:"document"});
	});
}
function clearUnreadMessages(){
	chrome.cookies.get({url:"https://scratch.mit.edu/",name:"scratchcsrftoken"},function(tokenCookie){
		var token = tokenCookie.value;
		sendServerRequest("https://scratch.mit.edu/site-api/messages/messages-clear/",function(response){
			//console.log("clear request response:",response);
		},{includeXRequestedWith:true,csrfToken:token,requestType:"POST"});
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
function getJson(url,callback,includeXRequestedWith,includeXToken,errorHandler){
	var onError = errorHandler||callback;
	var request = new XMLHttpRequest();
	request.open("GET",url);
	request.responseType = "json";
	if (includeXRequestedWith){
		request.setRequestHeader("X-Requested-With","XMLHttpRequest");
	}
	if (includeXToken){
		request.setRequestHeader("X-Token",userData.token);
	}
	request.onload = function(){
		if (!request.response){
			onError({err:"No response from Scratch Servers!"});
		}else{
			callback(request.response);
		}
		request = null;
	};
	request.onerror = function(){
		onError({err:request.statusText});
		request = null;
	};
	try {
		request.send();
	}catch(e){
		onError({err:e.toString()});
	}
}
function sendServerRequest(url,callback,options={}){
	var onError = options.errorHandler||callback;
	var request = new XMLHttpRequest();
	request.open(options.requestType||"GET",url);
	request.responseType = options.type||"json";
	if (options.includeXRequestedWith){
		request.setRequestHeader("X-Requested-With","XMLHttpRequest");
	}
	if (options.xToken){
		request.setRequestHeader("X-Token",options.xToken);
	}
	if (options.csrfToken){
		request.setRequestHeader("X-CSRFToken",options.csrfToken);
	}
	request.onload = function(){
		callback(request.response);
		request = null;
	}
	request.onerror = function (){
		onError({err:request.statusText});
		request = null;
	}
	try {
		request.send(options.data);
	}catch(e){
		onError({err:e.toString});
	}
}
function displayMessageCount(count){
	chrome.browserAction.setBadgeText({text:""+(count||"")});
	chrome.browserAction.setBadgeBackgroundColor({color:[255,Math.floor(100+75*50/(50+count)),0,255]});
	chrome.browserAction.setIcon({path:"favicon.png"});
}
function displayOfflineSymbol(){
	chrome.browserAction.setBadgeText({text:""});
	chrome.browserAction.setIcon({path:"favicon_offline.png"});
}