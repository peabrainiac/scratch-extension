const ScratchAPI = (function(){
	var exports = {};
	var projectCache = {ids:[]};
	exports.getSessionData = function(callback){
		sendServerRequest("https://scratch.mit.edu/session/",callback,{requestedWith:"XMLHttpRequest"});
	};
	exports.getMessageCount = function(callback){
		sendServerRequest("https://scratch.mit.edu/messages/ajax/get-message-count/",callback);
	};
	exports.getMessages = function(start,amount,lastID,user,token,sendProgress,callback){
		var offset = start;
		var remaining = amount;
		var url = "https://api.scratch.mit.edu/users/"+user+"/messages";
		var messages = new Array(amount);
		var nextBundleLength = 0;
		var foundLastMessage = false;
		nextMessageBundle([]);
		function nextMessageBundle(bundle){
			for (let i=0,l=bundle.length;i<l&&!foundLastMessage;i++){
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
				sendProgress(1-(remaining-nextBundleLength)/amount);
				sendServerRequest(url+"?limit="+nextBundleLength+"&offset="+offset,nextMessageBundle,{xToken:token});
			}
		}
	};
	exports.getCommentsFromPage = function(pageType,pageID,commentsList,callback){
		var nextPage = 0;
		var commentThreadsGot = [];
		var remainingIDs = new Array(commentsList.length);
		for (let i=0;i<commentsList.length;i++){
			remainingIDs[i] = commentsList[i].id;
		}
		getNextPage();
		function getNextPage(){
			if (remainingIDs.length>0){
				exports.getCommentsPage(pageType,pageID,nextPage,onCommentPage);
			}else{
				callback(commentThreadsGot);
			}
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
	};
	exports.getCommentsPage = function(pageType,pageID,offset,callback){
		var url = "https://scratch.mit.edu/site-api/comments/"+((pageType=="profile")?"user/":"project/")+pageID+"/?page="+(offset+1);
		sendServerRequest(url,callback,{responseType:"document"});
	};
	exports.getProjectData = function(projectID,callback){
		var url = "https://api.scratch.mit.edu/projects/"+projectID+"/";
		sendServerRequest(url,function(response){
			var data = {};
			data.id = response.id;
			data.title = response.title;
			data.image = response.image;
			data.author = response.author;
			data.stats = {loves:response.stats.loves,favs:response.stats.favorites,views:response.stats.views,remixes:response.stats.remixes,comments:response.stats.comments};
			data.shared = response.is_published;
			data.remixed = response.remix;
			callback(data);
		});
	};
	exports.clearProjectCache = function(){
		
	};
	exports.getAllProjects = function(page,callback){
		var url = "https://scratch.mit.edu/site-api/projects/all/"+(page?"?page="+page:"");
		sendServerRequest(url,callback);
	};
	exports.postComment = function(url,commentText,commentThread,commentRecipient,csrfToken,callback){
		var postData = '{"content":"'+commentText.replace(/"/g,"\\\"")+'","parent_id":'+(commentThread||'""')+',"commentee_id":'+(commentRecipient||'""')+'}';
		sendServerRequest(url,function(response){
			var commentData;
			if ((response instanceof HTMLDocument)&&(response.getElementsByClassName("comment").length>0)){
				var commentElement = response.getElementsByClassName("comment")[0];
				commentData = commentElementToJson(commentElement);
			}
			callback(commentData);
		},{requestedWith:"XMLHttpRequest",csrfToken:csrfToken,requestType:"POST",data:postData,responseType:"document"});
	};
	exports.clearUnreadMessages = function(csrfToken,callback){
		var url = "https://scratch.mit.edu/site-api/messages/messages-clear/";
		sendServerRequest(url,function(){},{requestedWith:"XMLHttpRequest",csrfToken:csrfToken,requestType:"POST"});
	};
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
	var requestHandlers = {};
	requestHandlers.onMessageClear = function(request){
		if (!hasReferer(request)){
			request.requestHeaders.push({name:"Referer",value:"https://scratch.mit.edu/messages/"});
		}
		onClearedMessages();
		return {requestHeaders:request.requestHeaders};
	};
	requestHandlers.onAddProfileComment = function(request){
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
	};
	requestHandlers.onAddProjectComment = function(request){
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
	};
	requestHandlers.setReferer = function(request){
		console.log("received request:",request);
		console.log("X-Set-Referer:",hasHeader(request,"X-Set-Referer"));
		console.log("Referer:",hasHeader(request,"Referer"));
		if (hasHeader(request,"X-Set-Referer")&&!hasHeader(request,"Referer")){
			console.log("adding Header");
			request.requestHeaders.push({name:"Referer",value:getHeader(request,"X-Set-Referer")});
		}
		console.log("new headers:",request.requestHeaders);
		return {requestHeaders:request.requestHeaders};
	};
	function hasHeader(request,header){
		var gotHeader = false;
		for (let i=0,l=request.requestHeaders.length;i<l;i++){
			if (request.requestHeaders[i].name==header){
				gotHeader = true;
			}
		}
		return gotHeader;
	}
	function getHeader(request,header){
		var value;
		for (let i=0,l=request.requestHeaders.length;i<l;i++){
			if (request.requestHeaders[i].name==header){
				value = request.requestHeaders[i].value;
			}
		}
		return value;
	}
	function hasReferer(request){
		hasHeader(request,"Referer");
	}
	chrome.webRequest.onBeforeSendHeaders.addListener(requestHandlers.onMessageClear,{urls:["https://scratch.mit.edu/site-api/messages/messages-clear/"]},["blocking","requestHeaders"]);
	chrome.webRequest.onBeforeSendHeaders.addListener(requestHandlers.onAddProfileComment,{urls:["https://scratch.mit.edu/site-api/comments/user/*/add/"]},["blocking","requestHeaders"]);
	chrome.webRequest.onBeforeSendHeaders.addListener(requestHandlers.onAddProjectComment,{urls:["https://scratch.mit.edu/site-api/comments/project/*/add/"]},["blocking","requestHeaders"]);
	chrome.webRequest.onBeforeSendHeaders.addListener(requestHandlers.setReferer,{urls:["https://scratch.mit.edu/site-api/users/curators-in/*/promote/?*","https://scratch.mit.edu/site-api/users/curators-in/*/remove/?*"]},["blocking","requestHeaders"]);
	function sendServerRequest(url,callback,options={}){
		var onError = options.errorHandler||callback;
		var request = new XMLHttpRequest();
		request.open(options.requestType||"GET",url);
		request.responseType = options.responseType||"json";
		if (options.requestedWith){
			request.setRequestHeader("X-Requested-With",options.requestedWith);
		}
		if (options.xToken){
			request.setRequestHeader("X-Token",options.xToken);
		}
		if (options.csrfToken){
			request.setRequestHeader("X-CSRFToken",options.csrfToken);
		}
		request.onload = function(){
			callback(request.response||{err:"No Response from "+url});
		}
		request.onerror = function(){
			onError({err:request.statusText});
		}
		try {
			request.send(options.data);
		}catch(e){
			onError({err:e.toString()});
		}
	}
	Object.freeze(exports);
	return exports;
})();