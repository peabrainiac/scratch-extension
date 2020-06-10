var darkThemeCSS;
var darkThemeEnabled;
var supported = /^\/?((mystuff)|(explore\/.*)|(users\/.*)|(projects\/.*)|(studios\/.*))?\/?$/;
if (supported.test(document.location.pathname)){
	console.log("supported page; preparing dark theme");
	chrome.runtime.sendMessage({action:"getThemeSettings"},function(settings){
		console.log("got settings:",settings);
		onPageLoad(function(){
			injectCSS("inject/inject.css");
			applySettings(settings);
			addToggleButton();
		});
	});
	onPageLoad(function(){
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
}else{
	console.log("unsupported page; not preparing dark theme");
}
function applySettings(settings){
	if (settings.darkThemeEnabled){
		enableDarkTheme();
	}else {
		disableDarkTheme();
	}
}
function onPageLoad(f){
	if (document.readyState!="loading"){
		f();
	}else{
		window.addEventListener("DOMContentLoaded",f);
	}
}
function enableDarkTheme(){
	darkThemeCSS = darkThemeCSS||injectCSS("inject/dark_theme.css");
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