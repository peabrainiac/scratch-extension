document.addEventListener("DOMContentLoaded",reload);
chrome.runtime.onMessage.addListener(receiveMessage);
var onDataGet = {};
var currentUser = {};
function reload(){
	chrome.runtime.sendMessage({action:"getData"});
	clearChildNodes(document.getElementById("content"));
	clearChildNodes(document.getElementById("footer-top"));
	document.getElementById("footer-top").style.top = "20px";
}
function receiveMessage(message){
	if (message.action=="showProgress"){
		showProgress(message.progress);
	}else if (message.action=="messageDataDone"){
		hideProgressbar();
		if (message.data.err){
			displayConnectionError(message.data);
		}else{
			displayMessages(message.data);
		}
	}else if (message.action=="gotProjectStats"){
		displayProjectStats(message.data);
	}else if (message.action=="gotMoreData"){
		onDataGet[message.identifier](message.data);
	}else if (message.action=="clearedUnreadMessages"){
		reload();
	}
}
function displayMessages(data){
	console.log("message data:",data);
	currentUser = data.user;
	if (data.follows||data.invites||data.comments||data.projects||data.studios){
		addClearButton();
	}else{
		displayNoMessagesText();
	}
	if (data.follows){
		displayNewFollows(data.follows);
	}
	if (data.invites){
		displayInvitations(data.invites);
	}
	if (data.comments){
		displayComments(data.comments);
	}
	if (data.projects){
		chrome.runtime.sendMessage({action:"clearProjectsList"});
		for (let i=0;i<data.projects.ids.length;i++){
			displayProjectActivity(data.projects[data.projects.ids[i]]);
		}
	}
	if (data.studios){
		displayStudioActivities(data.studios);
	}
	//console.log("data from background script:",data);
	function displayNewFollows(followers){
		var bundle = createMessageBundle();
		createTextNode(followers.length+" new follower"+((followers.length!=1)?"s":""),bundle.header);
		for (let i=0;i<followers.length;i++){
			var line = createElement("div","message-bundle-line",bundle.body);
			createHyperlink(followers[i],userURL(followers[i]),line);
		}
	}
	function displayInvitations(invites){
		var bundle = createMessageBundle();
		createTextNode(invites.length+" studio invitation"+((invites.length!=1)?"s":""),bundle.header);
		for (let i=0;i<invites.length;i++){
			var line = createElement("div","message-bundle-line",bundle.body);
			createHyperlink(invites[i].title,studioURL(invites[i].studioID),line);
			var right = createElement("span","message-bundle-line-right",line);
			createTextNode("by ",right);
			createHyperlink(invites[i].user,userURL(invites[i].user),right);
		}
		bundle.expand();
	}
	function displayComments(comments){
		console.log("comments:",comments);
		var bundle = createMessageBundle();
		var length = comments.ownProfile?comments.ownProfile.length:0;
		if (comments.profiles){
			for (let i=0;i<comments.profiles.length;i++){
				length += comments.profileComments[comments.profiles[i]].length;
			}
		}
		if (comments.projects){
			for (let i=0;i<comments.projects.ids.length;i++){
				length += comments.projects[comments.projects.ids[i]].comments.length;
			}
		}
		createTextNode(length+" comment"+((length!=1)?"s":""),bundle.header);
		if (comments.ownProfile){
			displayCommentThreads({type:"profile",id:comments.ownProfileID,name:"ownprofile"},createElement("div","message-bundle-comments",bundle.body),bundle.resize);
		}
		if (comments.profiles){
			for (let i=0;i<comments.profiles.length;i++){
				var profile = comments.profiles[i];
				var subHeader = createElement("div","message-bundle-subheader",bundle.body);
				createHyperlink("@"+profile,userURL(profile),subHeader);
				createTextNode("'s profile",subHeader);
				displayCommentThreads({type:"profile",id:profile,name:"profile-"+profile},createElement("div","message-bundle-comments",bundle.body),bundle.resize);
			}
		}
		if (comments.projects){
			for (let i=0;i<comments.projects.ids.length;i++){
				var projectID = comments.projects.ids[i];
				var subHeader = createElement("div","message-bundle-subheader",bundle.body);
				createHyperlink(comments.projects[projectID].title,projectURL(projectID),subHeader);
				displayCommentThreads({type:"project",id:projectID,name:"project-"+projectID},createElement("div","message-bundle-comments",bundle.body),bundle.resize);
			}
		}
		bundle.expand();
	}
	function displayProjectActivity(project){
		var bundle = createMessageBundle();
		createTextNode(project.title,bundle.header);
		bundle.addIcon("love",project.loves.length);
		bundle.addIcon("fav",project.favs.length);
		bundle.addIcon("comment",project.comments.length);
		bundle.addIcon("remix",project.remixes.length);
		loadProjectStats(project.id,createElement("div","message-bundle-stats",bundle.body),bundle.resize);
		displayRemixes(project.remixes,bundle.body,bundle.resize);
		if (project.comments.length>0){
			displayCommentThreads({type:"project",id:project.id,name:"project-"+project.id},createElement("div","message-bundle-comments",bundle.body),bundle.resize);
		}
		if (project.comments.length>0||project.remixes.length>0){
			bundle.expand();
		}
	}
	function displayStudioActivities(studios){
		var bundle = createMessageBundle();
		createTextNode(studios.ids.length+" studio activit"+((studios.ids.length!=1)?"ies":"y"),bundle.header);
		for (let i=0;i<studios.ids.length;i++){
			var line = createElement("div","message-bundle-line",bundle.body);
			createHyperlink(studios[studios.ids[i]].title,studioURL(studios.ids[i]),line);
		}
	}
	function displayRemixes(remixes,container,onResize){
		for (let i=0;i<remixes.length;i++){
			displayRemix(remixes[i],createElement("div","box",container),onResize);
		}
	}
	function displayRemix(remix,box,onResize){
		chrome.runtime.sendMessage({action:"getProjectData",data:{id:remix.id}});
		onDataGet["data-project-"+remix.id] = function(data){
			var imageLink = createElement("a","box-img-a",box);
			var image = createElement("img","box-img",imageLink);
			imageLink.href = projectURL(data.id);
			image.src = data.image;
			createHyperlink(data.title,projectURL(data.id),createElement("div","box-title",box));
			var text = createElement("div","box-text",box);
			createTextNode("remixed by ",text);
			createHyperlink("@"+remix.user,userURL(remix.user),text);
			onResize();
		};
	}
}
function displayCommentThreads(enviroment,container,onResize){
	onDataGet["unread-comments-"+enviroment.name] = function(data){
		//console.log("Got comments data:",data);
		for (let i=0;i<data.length;i++){
			var threadDiv = createElement("div","comment-thread",container);
			var thread = data[i];
			for (let j=0;j<thread.length;j++){
				displayComment(thread[j],createElement("div","",threadDiv),{type:enviroment.type,id:enviroment.id},j!=0,onResize);
			}
		}
		onResize();
	}
}
function displayComment(comment,div,enviroment,isReply,onResize){
	div.className = "comment-box"+(isReply?" reply":"")+(comment.isNew?" new":"");
	var a1 = createElement("a","comment-img-a",div);
	a1.href = userURL(comment.user);
	var img = createElement("img","comment-img",a1);
	img.src = comment.userImg;
	var a2 = createHyperlink(comment.user,userURL(comment.user),div);
	a2.className = "comment-user-link";
	createElement("br","",div);
	for (let i=0;i<comment.content.length;i++){
		var node = comment.content[i];
		if (node.type=="text"){
			createTextNode(node.text,div);
		}else{
			createHyperlink(node.text,node.href,div);
		}
	}
	createElement("br","",div);
	var reply = createElement("span","comment-reply-link",div);
	createTextNode("reply",reply);
	reply.addEventListener("click",function(){
		//console.log("reply button pressed: ",comment.reply);
		addCommentForm(div,comment.reply,enviroment,onResize);
		onResize();
	});
}
function addCommentForm(commentDiv,replyData,enviroment,onResize){
	var container = commentDiv.parentElement;
	var prevForms = container.getElementsByClassName("comment-box form reply");
	for (let i=0,l=prevForms.length;i<l;i++){
		prevForms[i].remove();
	}
	var div = createElement("div","comment-box form reply",container);
	var errorBox = createElement("div","comment-box reply error hidden",container);
	var clicktrap = createElement("div","comment-form-clicktrap",div);
	var img = createElement("img","comment-img",createElement("a","comment-img-a",div));
	img.src = currentUser.userImg;
	var wrapper = createElement("div","comment-form-wrapper",div);
	createTextNode("@"+replyData.user,wrapper);
	createElement("br","",wrapper);
	var input = createElement("textarea","comment-form-input",wrapper);
	input.focus();
	var buttons = createElement("div","comment-form-buttons",wrapper);
	var postButton = createElement("div","comment-form-button-post",buttons);
	var cancelButton = createElement("div","comment-form-button-cancel",buttons);
	var charsDisplay = createElement("span","comment-form-info-chars",buttons);
	createTextNode("Post",postButton);
	createTextNode("Cancel",cancelButton);
	createTextNode("0/500",charsDisplay);
	var chars = 0;
	postButton.addEventListener("click",function(){
		if (!(input.value.length>500)){
			hideErrorBox();
			showClicktrap();
			postComment(input.value,enviroment.type,enviroment.id,replyData.threadID,replyData.userID,function(response){
				hideClicktrap();
				if (!response.error){
					displayComment(response,createElement("div","",container),enviroment,true,onResize);
					closeCommentForm();
				}else{
					showError("There was an error posting this comment. Please try again in a few minutes - Scratch only lets you post about one comment per minute, so that may be the problem.");
				}
				onResize();
			});
		}
	});
	cancelButton.addEventListener("click",closeCommentForm);
	input.addEventListener("input",updateCharsDisplay);
	function closeCommentForm(){
		div.remove();
		errorBox.remove();
		onResize();
	}
	function updateCharsDisplay(){
		charsDisplay.innerHTML = input.value.length+"/500";
		if (input.value.length>500&&!(chars>500)){
			charsDisplay.classList.add("red");
			postButton.classList.add("disabled");
		}else if (chars>500&&!(input.value.length>500)){
			charsDisplay.classList.remove("red");
			postButton.classList.remove("disabled");
		}
		chars = input.value.length;
	}
	function showClicktrap(){
		clicktrap.style.height = div.scrollHeight;
		clicktrap.focus();
	}
	function hideClicktrap(){
		clicktrap.style.height = 0;
	}
	function showError(error){
		while (errorBox.firstChild){
			errorBox.removeChild(errorBox.firstChild);
		}
		createTextNode(error,errorBox);
		errorBox.classList.remove("hidden");
		onResize();
	}
	function hideErrorBox(){
		errorBox.classList.add("hidden");
		onResize();
	}
}
function postComment(text,pageType,pageID,threadID,parentID,callback){
	var url = "https://scratch.mit.edu/site-api/comments/"
	if (pageType=="profile"){
		url += "user/"+pageID+"/add/";
	}else if (pageType=="project"){
		url += "project/"+pageID+"/add/";
	}
	chrome.runtime.sendMessage({action:"postComment",data:{text:text,url:url,thread:threadID,parent:parentID}});
	onDataGet["comment-response-"+threadID+"-"+parentID] = callback;
}
function loadProjectStats(projectID,line,callback){
	chrome.runtime.sendMessage({action:"getProjectData",data:{id:projectID}});
	onDataGet["data-project-"+projectID] = function(data){
		//console.log("Got project stats data:",data);
		createTextNode(data.stats.views,line);
		createElement("span","symbol-view-grey",line);
		createTextNode(data.stats.loves,line);
		createElement("span","symbol-love-grey",line);
		createTextNode(data.stats.favs,line);
		createElement("span","symbol-fav-grey",line);
		createTextNode(data.stats.remixes,line);
		createElement("span","symbol-remix-grey",line);
		callback();
	}
}
function displayConnectionError(){
	currentUser = {};
	var errorBox = createElement("div","textbox",document.getElementById("content"));
	var title = createElement("div","textbox-title",errorBox);
	createTextNode("Can't get message data",title);
	createTextNode("Please check your internet connection and make sure you are connected and ",errorBox);
	createHyperlink("logged in on scratch","https://scratch.mit.edu/",errorBox,"_blank");
	createTextNode(".",errorBox);
}
function displayNoMessagesText(){
	var textbox = createElement("div","textbox",document.getElementById("content"));
	var title = createElement("div","textbox-title",textbox);
	createTextNode("No unread messages",title);
}
function addClearButton(){
	var container = document.getElementById("footer-top");
	var button = createElement("div","footer-button-clear",container);
	createTextNode("mark as read",button);
	container.style.top = "-20px";
	button.addEventListener("click",function(){
		chrome.runtime.sendMessage({action:"clearUnreadMessages"});
	});
}
function showProgress(progress){
	//console.log("loading progress: ",progress);
	document.getElementById("progressbar").style.height = "5px";
	document.getElementById("progress").style.width = Math.floor(progress*100)+"%";
}
function hideProgressbar(){
	document.getElementById("progressbar").style.height = 0;
}
function projectURL(id){
	return "https://scratch.mit.edu/projects/"+id+"/";
}
function studioURL(id){
	return "https://scratch.mit.edu/studios/"+id+"/";
}
function userURL(user){
	return "https://scratch.mit.edu/users/"+user+"/";
}
function createMessageBundle(){
	var bundle = {};
	bundle.container = createElement("div","message-bundle",document.getElementById("content"));
	bundle.header = createElement("div","message-bundle-header",bundle.container);
	bundle.headerIcons = createElement("div","message-bundle-header-right",bundle.header);
	bundle.bodyWrapper = createElement("div","message-bundle-wrapper",bundle.container);
	bundle.body = createElement("div","message-bundle-body",bundle.bodyWrapper);
	bundle.expanded = false;
	bundle.expand = function(){
		bundle.bodyWrapper.style.height = bundle.body.clientHeight+2;
		bundle.header.style.cursor = "auto";
		bundle.expanded = true;
	};
	bundle.collapse = function(){
		bundle.bodyWrapper.style.height = 0;
		bundle.header.style.cursor = "pointer";
		bundle.expanded = false;
	};
	bundle.toggleExpanded = function(){
		if (bundle.expanded){
			bundle.collapse();
		}else{
			bundle.expand();
		}
	};
	bundle.resize = function(){
		if (bundle.expanded){
			bundle.expand();
			bundle.resetScroll();
		}else {
			bundle.collapse();
		}
	};
	bundle.resetScroll = function(){
			bundle.bodyWrapper.scrollTop = 0
	};
	bundle.addIcon = function(icon,amount){
		if (amount>0){
			createTextNode(" "+amount,bundle.headerIcons);
			createElement("span","symbol-"+icon,bundle.headerIcons);
		}
	};
	bundle.header.addEventListener("click",bundle.toggleExpanded);
	bundle.collapse();
	return bundle;
}
function clearChildNodes(element){
	while (element.firstChild){
		element.removeChild(element.firstChild);
	}
}
function createHyperlink(text,href,parentElement,target){
	var a = createElement("a","",parentElement);
	a.href = href;
	createTextNode(text,a);
	if (target){
		a.target = target;
	}
	return a;
}
function createElement(tag,className,parentElement){
	var element = document.createElement(tag);
	element.className = className||"";
	if (parentElement){
		parentElement.appendChild(element);
	}
	return element;
}
function createTextNode(text,parentElement){
	var textNode = document.createTextNode(text);
	if (parentElement){
		parentElement.appendChild(textNode);
	}
	return textNode;
}