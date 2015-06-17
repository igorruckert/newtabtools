let AboutNewTabListener = {
  init: function(chromeGlobal) {
    chromeGlobal.addEventListener("NewTabTools:PageLoad", this, false, true);
    chromeGlobal.addEventListener("NewTabTools:ShowOptions", this, false, true);
  },
  get isAboutNewTab() {
    return content.document.documentURI == "about:newtab" ||
      content.document.documentURI == "chrome://newtabtools/content/newTab.xhtml";
  },
  handleEvent: function(aEvent) {
    if (!this.isAboutNewTab) {
      return;
    }

    switch (aEvent.type) {
      case "NewTabTools:PageLoad":
        this.onPageLoad();
        break;
      case "click":
        this.onClick(aEvent);
        break;
      case "pagehide":
        this.onPageHide();
        break;
      case "NewTabTools:ShowOptions":
        sendAsyncMessage("NewTabTools:ShowOptions");
        break;
    }
  },
  onPageLoad: function() {
    addEventListener("click", this, true);
    addEventListener("pagehide", this, true);
  },
  onPageHide: function() {
    removeEventListener("click", this, true);
    removeEventListener("pagehide", this, true);
  },
  onClick: function(aEvent) {
    if (!aEvent.isTrusted || // Don't trust synthetic events
        aEvent.button == 2 || aEvent.target.localName != "button") {
      return;
    }

    let originalTarget = aEvent.originalTarget;
    let ownerDoc = originalTarget.ownerDocument;
    if (ownerDoc.documentURI != "about:newtab") {
      // This shouldn't happen, but we're being defensive.
      return;
    }

    switch (originalTarget.getAttribute("id")) {
      case "downloads":
        sendAsyncMessage("AboutHome:Downloads");
        break;

      case "bookmarks":
        sendAsyncMessage("AboutHome:Bookmarks");
        break;

      case "history":
        sendAsyncMessage("AboutHome:History");
        break;

      case "addons":
        sendAsyncMessage("AboutHome:Addons");
        break;

      case "sync":
        sendAsyncMessage("AboutHome:Sync");
        break;

      case "settingsWin":
      case "settingsUnix":
        sendAsyncMessage("AboutHome:Settings");
        break;

      case "restorePreviousSession":
        sendAsyncMessage("AboutHome:RestorePreviousSession");
        ownerDoc.getElementById("launcher").removeAttribute("session");
        break;
    }
  }
};
AboutNewTabListener.init(this);
