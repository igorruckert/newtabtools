Components.utils.import("resource://gre/modules/Services.jsm");

if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_CONTENT) {
	Services.console.logStringMessage("This is the process script in a content process");
} else {
	Services.console.logStringMessage("This is the process script in the main process");
}

addMessageListener("NewTabTools:Change", function({ data: { url, key }}) {
  let urlString = Components.classes["@mozilla.org/supports-string;1"]
    .createInstance(Components.interfaces.nsISupportsString);
  urlString.data = url;
  Services.obs.notifyObservers(urlString, "newtabtools-change", key);
});
