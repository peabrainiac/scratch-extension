var darkThemeCSS;
var darkThemeEnabled;
var supported = /^\/?((mystuff)|(explore\/.*)|(users\/.*)|(projects\/.*)|(studios\/.*))?\/?$/;
var studios = /^\/studios\/\d*\/curators\/?$/;
if (studios.test(document.location.pathname)){
	onPageLoad(addGalleryUtils);
}
if (!supported.test(document.location.pathname)){
	console.log("unsupported page; not preparing dark theme");
}else{
	console.log("supported page; preparing dark theme");
	chrome.runtime.sendMessage({action:"getThemeSettings"},function(settings){
		console.log("got settings:",settings);
		onPageLoad(function(){
			injectCSS("inject/inject.css");
			applySettings(settings);
			addToggleButton();
			window.addEventListener("focus",function(){
				console.log("focus event!");
				chrome.runtime.sendMessage({action:"getThemeSettings"},function(response){
					applySettings(response);
				});
			});
			setInterval(function(){
				chrome.runtime.sendMessage({action:"getThemeSettings"},function(response){
					applySettings(response);
				});
			},5000);
		});
	});
}
function applySettings(settings){
	if (settings.darkThemeEnabled){
		enableDarkTheme();
	}else {
		disableDarkTheme();
	}
}
function enableDarkTheme(){
	darkThemeCSS = darkThemeCSS||injectCSS("inject/dark theme/main.css");
	darkThemeCSS.disabled = false;
	darkThemeEnabled = true;
}
function disableDarkTheme(){
	if (darkThemeCSS){
		darkThemeCSS.disabled = true;
	}
	darkThemeEnabled = false;
}
function toggleDarkTheme(){
	if (darkThemeEnabled){
		disableDarkTheme();
	}else{
		enableDarkTheme();
	}
	chrome.runtime.sendMessage({action:"setThemeSettings",settings:{darkThemeEnabled:darkThemeEnabled}});
}
function addToggleButton(){
	var oldBtn = document.getElementById("dark-theme-toggle-btn");
	if (oldBtn){
		oldBtn.remove();
	}
	var btn = document.createElement("div");
	btn.id = "dark-theme-toggle-btn";
	btn.style.backgroundImage = "url("+chrome.extension.getURL("inject/icons_xs.png")+")";
	btn.addEventListener("click",toggleDarkTheme);
	if (document.getElementById("explore-bar")){
		btn.style.bottom = "auto";
		btn.style.top = "-33px";
		btn.style.position = "absolute";
		document.getElementById("explore-bar").appendChild(btn);
	}else{
		document.body.appendChild(btn);
	}
}
function injectCSS(path){
	var link = loadCSS(path);
	document.head.appendChild(link);
	return link;
}
function loadCSS(path){
	var link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = chrome.extension.getURL(path);
	return link;
}
function onPageLoad(f){
	if (document.readyState!="loading"){
		f();
	}else{
		window.addEventListener("DOMContentLoaded",f);
	}
}
function addGalleryUtils(){
	var showButton = document.getElementById("show-add-curator");
	if (showButton){
		showButton.firstElementChild.innerHTML = "manage curators";
		var container = document.getElementById("add-curator-dialog").firstElementChild;
		document.getElementById("add-curator").firstElementChild.innerHTML = "+ Add";
		var promoteButton = createButton("promoteButton","+ Promote",container);
		var removeButton = createButton("removeButton","- Remove",container);
		promoteButton.addEventListener("click",function(){
			var data = getRequestData();
			var request = new XMLHttpRequest();
			request.open("PUT","https://scratch.mit.edu/site-api/users/curators-in/"+data.studioID+"/promote/?usernames="+data.users);
			request.setRequestHeader("X-CSRFToken",data.csrfToken);
			request.setRequestHeader("X-Requested-With","XMLHttpRequest");
			request.setRequestHeader("X-Set-Referer",data.referer);
			request.send();
			flashButtonColor(promoteButton,"#ffff00");
		});
		removeButton.addEventListener("click",function(){
			var data = getRequestData();
			var request = new XMLHttpRequest();
			request.open("PUT","https://scratch.mit.edu/site-api/users/curators-in/"+data.studioID+"/remove/?usernames="+data.users);
			request.setRequestHeader("X-CSRFToken",data.csrfToken);
			request.setRequestHeader("X-Requested-With","XMLHttpRequest");
			request.setRequestHeader("X-Set-Referer",data.referer);
			request.send();
			flashButtonColor(removeButton,"#ffff00");
		});
	}
	function getRequestData(){
		var data = {};
		data.users = document.getElementById("curator_ids").value;
		data.studioID = document.location.pathname.match(/studios\/\d*\/curators/)[0].split("/")[1];
		data.csrfToken = document.cookie.match(/[;^] scratchcsrftoken=[^; $]*/)[0].split("=")[1];
		data.referer = document.location+"";
		return data;
	}
	function flashButtonColor(button,color){
		button.style.backgroundColor = color;
		button.style.transition = "none";
		setTimeout(function(){
			button.style.transition = "";
			button.style.backgroundColor = "";
		},0);
	}
	function createButton(id,text,parent){
		var button = document.createElement("div");
		button.innerHTML = "<span></span>";
		button.querySelector("span").textContent = text;
		button.id = id;
		button.className = "button grey small";
		button.style.marginLeft = "5px";
		parent.appendChild(button);
		return button;
	}
}