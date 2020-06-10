const Debug = (function(){
	var exports = {};
	var enabledDebug = false;
	exports.enable = function(){
		enabledDebug = true;
		chrome.storage.local.set({enabledDebug:true},function(){
			console.log("Enabled console logs.");
		});
	};
	exports.disable = function(){
		enabledDebug = false;
		chrome.storage.local.set({enabledDebug:false},function(){
			console.log("Disabled console logs.");
		});
	};
	exports.log = function(){
		if (enabledDebug){
			console.log.apply(console,arguments);
		}
	};
	chrome.storage.local.get("enabledDebug",function(result){
		if (result.enabledDebug){
			enabledDebug = true;
			console.log("Status logs for this extension are currently enabled. Use Debug.disable() to deactivate them.");
		}else{
			console.log("Status logs for this extension are currently disabled. Use Debug.enable() to activate them.");
		}
	});
	Object.freeze(exports);
	return exports;
})();