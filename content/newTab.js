/*
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this file,
You can obtain one at http://mozilla.org/MPL/2.0/.
*/
/* globals Services, XPCOMUtils,
    FileUtils, NetUtil, SessionStore, OS, PageThumbs, PageThumbsStorage, PageThumbUtils,
    PlacesUtils, PrivateBrowsingUtils, SavedThumbs, TileData,
    gDrag, gGrid, gBlockedLinks, gPinnedLinks, gTransformation, gUpdater, HTML_NAMESPACE */

let { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil", "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SessionStore", "resource:///modules/sessionstore/SessionStore.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbUtils", "resource://gre/modules/PageThumbUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils", "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SavedThumbs", "chrome://newtabtools/content/newTabTools.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TileData", "chrome://newtabtools/content/newTabTools.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "faviconService", "@mozilla.org/browser/favicon-service;1", "mozIAsyncFavicons");

let newTabTools = {
  onTileChanged: function(url, whatChanged) {
    for (let site of gGrid.sites) {
      if (site.url == url) {
        switch (whatChanged) {
        case "backgroundColor":
          site._querySelector(".newtab-thumbnail").style.backgroundColor = TileData.get(url, "backgroundColor");
          break;
        case "thumbnail":
          site.refreshThumbnail();
          break;
        case "title":
          site._addTitleAndFavicon();
          break;
        }
      }
    }
  },
  get backgroundImageFile() {
    return FileUtils.getFile("ProfD", ["newtab-background"], true);
  },
  get backgroundImageURL() {
    return Services.io.newFileURI(this.backgroundImageFile);
  },
  refreshBackgroundImage: function() {
    if (this.backgroundImageFile.exists()) {
      this.page.style.backgroundImage =
        'url("' + this.backgroundImageURL.spec + '?' + this.backgroundImageFile.lastModifiedTime + '")';
      document.documentElement.classList.add("background");
    } else {
      this.page.style.backgroundImage = null;
      document.documentElement.classList.remove("background");
    }
  },
  updateUI: function() {
    let launcherPosition = this.prefs.getIntPref("launcher");
    if (launcherPosition) {
      let positionNames = ["top", "right", "bottom", "left"];
      document.documentElement.setAttribute("launcher", positionNames[launcherPosition - 1]);
    } else {
      document.documentElement.removeAttribute("launcher");
    }

    let theme = this.prefs.getCharPref("theme");
    document.documentElement.setAttribute("theme", theme);

    let containThumbs = this.prefs.getBoolPref("thumbs.contain");
    document.documentElement.classList[containThumbs ? "add" : "remove"]("containThumbs");

    let hideButtons = this.prefs.getBoolPref("thumbs.hidebuttons");
    document.documentElement.classList[hideButtons ? "add" : "remove"]("hideButtons");

    let hideFavicons = this.prefs.getBoolPref("thumbs.hidefavicons");
    document.documentElement.classList[hideFavicons ? "add" : "remove"]("hideFavicons");

    let titleSize = this.prefs.getCharPref("thumbs.titlesize");
    document.documentElement.setAttribute("titlesize", titleSize);

    let gridMargin = ["small", "small", "small", "small"];
    let prefGridMargin = this.prefs.getCharPref("grid.margin").split(" ", 4);
    if (prefGridMargin.length == 4) {
      gridMargin = prefGridMargin;
    }
    this.setGridMargin("top", gridMargin[0]);
    this.setGridMargin("right-top", gridMargin[1]);
    this.setGridMargin("right-bottom", gridMargin[1]);
    this.setGridMargin("bottom", gridMargin[2]);
    this.setGridMargin("left-bottom", gridMargin[3]);
    this.setGridMargin("left-top", gridMargin[3]);

    let gridSpacing = this.prefs.getCharPref("grid.spacing");
    document.documentElement.setAttribute("spacing", gridSpacing);
  },
  setGridMargin: function(aPiece, aSize) {
    let pieceElement = document.getElementById("newtab-margin-" + aPiece);
    pieceElement.classList.remove("medium");
    pieceElement.classList.remove("large");
    if (aSize == "medium" || aSize == "large") {
      pieceElement.classList.add(aSize);
    }
  },
  startRecent: function() {
    let tabContainer = this.browserWindow.gBrowser.tabContainer;
    let handler = this.refreshRecent.bind(this);
    tabContainer.addEventListener("TabOpen", handler, false);
    tabContainer.addEventListener("TabClose", handler, false);

    window.addEventListener("unload", function() {
      tabContainer.removeEventListener("TabOpen", handler, false);
      tabContainer.removeEventListener("TabClose", handler, false);
    }, false);
    handler();

    window.addEventListener("resize", this.trimRecent.bind(this));
    this.recentListOuter.addEventListener("overflow", this.trimRecent.bind(this));
  },
  refreshRecent: function(aEvent) {
    // Redefine this because this function is called before it is defined
    let HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

    if (aEvent && aEvent.originalTarget.linkedBrowser.contentWindow == window) {
      return;
    }

    if (!this.prefs.getBoolPref("recent.show")) {
      this.recentList.hidden = true;
      return;
    }

    for (let element of this.recentList.querySelectorAll("a")) {
      this.recentList.removeChild(element);
    }

    let added = 0;
    let undoItems = JSON.parse(SessionStore.getClosedTabData(this.browserWindow));
    for (let i = 0; i < undoItems.length; i++) {
      let item = undoItems[i];
      let index = i;
      let iconURL;
      let url;

      if (item.image) {
        iconURL = item.image;
        if (/^https?:/.test(iconURL)) {
          iconURL = "moz-anno:favicon:" + iconURL;
        }
      } else {
        iconURL = "chrome://mozapps/skin/places/defaultFavicon.png";
      }

      let tabData = item.state;
      let activeIndex = (tabData.index || tabData.entries.length) - 1;
      if (activeIndex >= 0 && tabData.entries[activeIndex]) {
        url = tabData.entries[activeIndex].url;
        if (url == "about:newtab" && tabData.entries.length == 1) {
          continue;
        }
      }

      let a = document.createElementNS(HTML_NAMESPACE, "a");
      a.href = url;
      a.className = "recent";
      a.title = (item.title == url ? item.title : item.title + "\n" + url);
      a.onclick = function() {
        newTabTools.browserWindow.undoCloseTab(index);
        return false;
      };
      let img = document.createElementNS(HTML_NAMESPACE, "img");
      img.className = "favicon";
      img.src = iconURL;
      a.appendChild(img);
      a.appendChild(document.createTextNode(item.title));
      this.recentList.appendChild(a);
      added++;
    }
    this.trimRecent();
    this.recentList.hidden = !added;
  },
  trimRecent: function() {
    let width = this.recentListOuter.clientWidth;
    let elements = document.querySelectorAll(".recent");
    let hiding = false;

    for (let recent of elements) {
      recent.style.display = null;
    }
    for (let recent of elements) {
      if (hiding || recent.offsetLeft + recent.offsetWidth > width) {
        recent.style.display = "none";
        hiding = true;
      }
    }
  },
  onVisible: function() {
    this.startRecent();
    if (!this.prefs.getBoolPref("optionspointershown")) {
      this.optionsTogglePointer.hidden = false;
      this.optionsTogglePointer.style.animationPlayState = "running";
    }
    this.onVisible = function() {};
  },
  showOptions: function() {
    document.dispatchEvent(new CustomEvent("NewTabTools:ShowOptions", { bubbles: true }));
  }
};

(function() {
  function getTopWindow() {
    return window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShellTreeItem)
                 .rootTreeItem
                 .QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIDOMWindow)
                 .wrappedJSObject;
  }

  XPCOMUtils.defineLazyGetter(newTabTools, "browserWindow", function() {
    return getTopWindow();
  });

  XPCOMUtils.defineLazyGetter(newTabTools, "prefs", function() {
    return Services.prefs.getBranch("extensions.newtabtools.");
  });

  XPCOMUtils.defineLazyGetter(newTabTools, "strings", function() {
    return Services.strings.createBundle("chrome://newtabtools/locale/newTabTools.properties");
  });

  let uiElements = {
    "page": "newtab-scrollbox",
    "launcher": "launcher",
    "optionsToggleButton": "options-toggle",
    "optionsTogglePointer": "options-toggle-pointer",
    "recentList": "newtab-recent",
    "recentListOuter": "newtab-recent-outer"
  };
  for (let key in uiElements) {
    let value = uiElements[key];
    XPCOMUtils.defineLazyGetter(newTabTools, key, () => document.getElementById(value));
  }

  if (Services.appinfo.OS == "WINNT") {
    document.getElementById("settingsUnix").style.display = "none";
    newTabTools.optionsToggleButton.title = document.getElementById("settingsWin").textContent;
  } else {
    document.getElementById("settingsWin").style.display = "none";
    newTabTools.optionsToggleButton.title = document.getElementById("settingsUnix").textContent;
  }

  newTabTools.optionsToggleButton.addEventListener("click", newTabTools.showOptions.bind(newTabTools), false);

  newTabTools.refreshBackgroundImage();
  newTabTools.updateUI();

  newTabTools.preloaded = document.visibilityState == "hidden";
  if (!newTabTools.preloaded) {
    newTabTools.onVisible();
  }

  window.addEventListener("load", function window_load() {
    window.removeEventListener("load", window_load, false);

    SessionStore.promiseInitialized.then(function() {
      if (SessionStore.canRestoreLastSession && !PrivateBrowsingUtils.isContentWindowPrivate(window)) {
        newTabTools.launcher.setAttribute("session", "true");
        Services.obs.addObserver({
          observe: function() {
            newTabTools.launcher.removeAttribute("session");
          },
          QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference])
        }, "sessionstore-last-session-cleared", true);
      }
    });

    gTransformation.oldGetNodePosition = gTransformation.getNodePosition;
    gTransformation.getNodePosition = function(aNode) {
      let {offsetLeft, offsetTop} = document.getElementById("newtab-vertical-margin");
      let position = this.oldGetNodePosition(aNode);
      position.left -= offsetLeft;
      position.top -= offsetTop;
      return position;
    };

    gDrag.oldStart = gDrag.start;
    gDrag.start = function(aSite, aEvent) {
      gDrag.oldStart(aSite, aEvent);
      let {offsetLeft, offsetTop} = document.getElementById("newtab-vertical-margin");
      this._offsetX += offsetLeft;
      this._offsetY += offsetTop;
    };

    gDrag.drag = function(aSite, aEvent) {
      // Get the viewport size.
      let {clientWidth, clientHeight} = document.documentElement;
      let {offsetLeft, offsetTop} = document.getElementById("newtab-vertical-margin");

      // We'll want a padding of 5px.
      let border = 5;

      // Enforce minimum constraints to keep the drag image inside the window.
      let left = Math.max(aEvent.clientX - this._offsetX, border - offsetLeft);
      let top = Math.max(aEvent.clientY - this._offsetY, border - offsetTop);

      // Enforce maximum constraints to keep the drag image inside the window.
      left = Math.min(left, clientWidth - this.cellWidth - border - offsetLeft);
      top = Math.min(top, clientHeight - this.cellHeight - border - offsetTop);

      // Update the drag image's position.
      gTransformation.setSitePosition(aSite, {left: left, top: top});
    };

    gUndoDialog.oldHide = gUndoDialog.hide;
    gUndoDialog.hide = function() {
      gUndoDialog.oldHide();
      newTabTools.trimRecent();
    };
  }, false);

  document.dispatchEvent(new CustomEvent("NewTabTools:PageLoad", { bubbles: true }));
})();
