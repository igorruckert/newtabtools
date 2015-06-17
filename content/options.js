/* globals NewTabUtils, Services, XPCOMUtils,
    FileUtils, NetUtil, NewTabToolsUtils, OS, PageThumbs, PageThumbsStorage, PageThumbUtils, PlacesUtils, SavedThumbs, TileData */
let Cc = Components.classes;
let Ci = Components.interfaces;
let Cu = Components.utils;
Cu.import("resource://gre/modules/NewTabUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

XPCOMUtils.defineLazyModuleGetter(this, "FileUtils", "resource://gre/modules/FileUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NetUtil", "resource://gre/modules/NetUtil.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "NewTabToolsUtils", "chrome://newtabtools/content/newTabTools.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbs", "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbsStorage", "resource://gre/modules/PageThumbs.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PageThumbUtils", "resource://gre/modules/PageThumbUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "PlacesUtils", "resource://gre/modules/PlacesUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "SavedThumbs", "chrome://newtabtools/content/newTabTools.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "TileData", "chrome://newtabtools/content/newTabTools.jsm");

let links = NewTabUtils.links.getLinks();

let gGridPrefs = {
  get gridRows() {
    return Math.max(1, Services.prefs.getIntPref("extensions.newtabtools.rows"));
  },
  get gridColumns() {
    return Math.max(1, Services.prefs.getIntPref("extensions.newtabtools.columns"));
  },
  get cellCount() {
    return this.gridRows * this.gridColumns;
  }
};

let newTabTools = {
  _selectedSiteIndex: 0,
  get tileCount() {
    return this.prefs.getIntPref("rows") * this.prefs.getIntPref("columns");
  },
  get selectedSite() {
    return links[this._selectedSiteIndex];
  },
  set selectedSiteIndex(index) {
    this._selectedSiteIndex = index;
    let site = this.selectedSite;
    let disabled = site == null;

    this.browseThumbnailButton.disabled = disabled;
    this.setThumbnailInput.value = "";
    this.setThumbnailInput.disabled = disabled;
    this.setTitleInput.disabled = disabled;
    this.setTitleButton.disabled = disabled;

    if (disabled) {
      this.siteThumbnail.style.backgroundImage = null;
      this.removeThumbnailButton.disabled = true;
      this.siteURL.value = "";
      this.setTitleInput.value = "";
      this.resetTitleButton.disabled = true;
      return;
    }

    SavedThumbs.getThumbnailURL(site.url).then((thumbnail) => {
      this.siteThumbnail.style.backgroundImage = 'url("' + thumbnail + '")';
      if (thumbnail.startsWith("file:")) {
        this.removeThumbnailButton.disabled = false;
        this.captureThumbnailButton.disabled = true;
      } else {
        OS.File.exists(PageThumbsStorage.getFilePathForURL(site.url)).then((exists) => {
          this.removeThumbnailButton.disabled = !exists;
          this.captureThumbnailButton.disabled = false;
        });
      }
    });

    let { gridRows, gridColumns } = gGridPrefs;
    let row = Math.floor(index / gridColumns);
    let column = index % gridColumns;
    this.tilePreviousRow.style.opacity = row == 0 ? 0.25 : null;
    this.tilePrevious.style.opacity = column == 0 ? 0.25 : null;
    this.tileNext.style.opacity = (column + 1 == gridColumns) ? 0.25 : null;
    this.tileNextRow.style.opacity = (row + 1 == gridRows) ? 0.25 : null;

    this.siteURL.value = site.url;
    let backgroundColor = TileData.get(site.url, "backgroundColor");
    this.siteThumbnail.style.backgroundColor =
      this.setBgColourInput.value =
      this.setBgColourDisplay.style.backgroundColor = backgroundColor;
    this.setBgColourButton.disabled =
      this.resetBgColourButton.disabled = !backgroundColor;
    let title = TileData.get(site.url, "title");
    this.setTitleInput.value = title || site.title || site.url;
    this.resetTitleButton.disabled = title === null;
  },
  get backgroundImageFile() {
    return FileUtils.getFile("ProfD", ["newtab-background"], true);
  },
  get backgroundImageURL() {
    return Services.io.newFileURI(this.backgroundImageFile);
  },
  optionsOnClick: function(event) {
    if (event.originalTarget.disabled) {
      return;
    }
    let id = event.originalTarget.id;
    switch (id) {
    case "options-pinURL":
      let link = this.pinURLInput.value;
      let linkURI = Services.io.newURI(link, null, null);
      event.originalTarget.disabled = true;
      PlacesUtils.promisePlaceInfo(linkURI).then(function(info) {
        newTabTools.pinURL(linkURI.spec, info.title);
        newTabTools.pinURLInput.value = "";
        event.originalTarget.disabled = false;
      }, function() {
        newTabTools.pinURL(linkURI.spec, "");
        newTabTools.pinURLInput.value = "";
        event.originalTarget.disabled = false;
      }).then(null, Cu.reportError);
      break;
    case "options-previous-row-tile":
      this.selectedSiteIndex = (this._selectedSiteIndex - gGridPrefs.gridColumns + gGridPrefs.cellCount) % gGridPrefs.cellCount;
      break;
    case "options-previous-tile":
    case "options-next-tile":
      let { gridColumns } = gGridPrefs;
      let row = Math.floor(this._selectedSiteIndex / gridColumns);
      let column = (this._selectedSiteIndex + (id == "options-previous-tile" ? -1 : 1) + gridColumns) % gridColumns;

      this.selectedSiteIndex = row * gridColumns + column;
      break;
    case "options-next-row-tile":
      this.selectedSiteIndex = (this._selectedSiteIndex + gGridPrefs.gridColumns) % gGridPrefs.cellCount;
      break;
    case "options-thumbnail-browse":
    case "options-bg-browse":
      let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
      fp.init(window, document.title, Ci.nsIFilePicker.modeOpen);
      fp.appendFilters(Ci.nsIFilePicker.filterImages);
      if (fp.show() == Ci.nsIFilePicker.returnOK) {
        if (id == "options-thumbnail-browse") {
          this.setThumbnailInput.value = fp.fileURL.spec;
          newTabTools.setThumbnailButton.disabled = false;
        } else {
          this.setBackgroundInput.value = fp.fileURL.spec;
          newTabTools.setBackgroundButton.disabled = false;
        }
      }
      break;
    case "options-thumbnail-set":
      this.setThumbnail(this.selectedSite, this.setThumbnailInput.value);
      break;
    case "options-thumbnail-remove":
      this.setThumbnail(this.selectedSite, null);
      break;
    case "options-thumbnail-refresh":
      event.originalTarget.disabled = true;
      SavedThumbs.forceReloadThumbnail(this.selectedSite.url).then(function() {
        event.originalTarget.disabled = false;
      });
      break;
    case "options-bgcolor-displaybutton":
      this.setBgColourInput.click();
      break;
    case "options-bgcolor-set":
      TileData.set(this.selectedSite.url, "backgroundColor", this.setBgColourInput.value);
      this.siteThumbnail.style.backgroundColor = this.setBgColourInput.value;
      this.resetBgColourButton.disabled = false;
      break;
    case "options-bgcolor-reset":
      TileData.set(this.selectedSite.url, "backgroundColor", null);
      this.siteThumbnail.style.backgroundColor =
        this.setBgColourInput.value =
        this.setBgColourDisplay.style.backgroundColor = null;
      this.setBgColourButton.disabled =
        this.resetBgColourButton.disabled = true;
      break;
    case "options-title-set":
      this.setTitle(this.selectedSite, this.setTitleInput.value);
      break;
    case "options-title-reset":
      this.setTitle(this.selectedSite, null);
      break;
    case "options-bg-set":
      if (this.setBackgroundInput.value) {
        let fos = FileUtils.openSafeFileOutputStream(this.backgroundImageFile);
        NetUtil.asyncFetch(this.setBackgroundInput.value, function(inputStream, status) {
          if (!Components.isSuccessCode(status)) {
            return;
          }
          NetUtil.asyncCopy(inputStream, fos, function () {
            FileUtils.closeSafeFileOutputStream(fos);
            NewTabToolsUtils.notifyObservers(null, "background");
          }.bind(this));
        }.bind(this));
      }
      break;
    case "options-bg-remove":
      if (this.backgroundImageFile.exists())
        this.backgroundImageFile.remove(true);
      NewTabToolsUtils.notifyObservers(null, "background");
      break;
    case "options-donate":
      let url = "https://addons.mozilla.org/addon/new-tab-tools/about";
      newTabTools.browserWindow.openLinkIn(url, "current", {});
      break;
    }
  },
  pinURL: function(link, title) {
    let index = links.length - 1;
    for (var i = 0; i < links.length; i++) {
      let s = links[i];
      if (s && !NewTabUtils.pinnedLinks.isPinned(s)) {
        index = i;
        break;
      }
    }

    NewTabUtils.blockedLinks.unblock(link);
    NewTabUtils.pinnedLinks.pin({url: link, title: title}, index);
    NewTabUtils.allPages.update();

    links = NewTabUtils.links.getLinks();
    this.selectedSiteIndex = index;
  },
  setThumbnail: function(site, src) {
    let leafName = SavedThumbs.getThumbnailLeafName(site.url);
    let path = SavedThumbs.getThumbnailPath(site.url, leafName);
    let file = FileUtils.File(path);
    let existed = SavedThumbs.hasSavedThumb(site.url, leafName);
    if (existed) {
      file.permissions = 0644;
      file.remove(true);
    }

    if (!src) {
      if (!existed) {
        path = PageThumbsStorage.getFilePathForURL(site.url);
        file = FileUtils.File(path);
        if (file.exists()) {
          file.permissions = 0644;
          file.remove(true);
        }
      }

      SavedThumbs.removeSavedThumb(site.url, leafName);
      this.removeThumbnailButton.blur();
      return;
    }

    let image = new Image();
    image.onload = function() {
      let [thumbnailWidth, thumbnailHeight] = "_getThumbnailSize" in PageThumbs ? PageThumbs._getThumbnailSize() : PageThumbUtils.getThumbnailSize();
      let scale = Math.max(thumbnailWidth / image.width, thumbnailHeight / image.height);

      let canvas = document.createElementNS(HTML_NAMESPACE, "canvas");
      canvas.mozOpaque = false;
      canvas.mozImageSmoothingEnabled = true;
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      let ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.mozFetchAsStream(function(aInputStream) {
        let outputStream = FileUtils.openSafeFileOutputStream(file);
        NetUtil.asyncCopy(aInputStream, outputStream, function() {
          FileUtils.closeSafeFileOutputStream(outputStream);
          SavedThumbs.addSavedThumb(site.url, leafName);
        });
      }, "image/png");
    };
    image.src = src;
  },
  setTitle: function(site, title) {
    TileData.set(site.url, "title", title);
    this.resetTitleButton.disabled = !title;
    if (!title) {
      this.setTitleInput.value = site.title;
      this.resetTitleButton.blur();
    }
  },
  toggleOptions: function() {
    if (document.documentElement.hasAttribute("options-hidden")) {
      document.documentElement.removeAttribute("options-hidden");
      this.selectedSiteIndex = 0;
    } else {
      this.hideOptions();
    }
  },
  hideOptions: function() {
    document.documentElement.setAttribute("options-hidden", "true");
  },
  updateUI: function() {
    let containThumbs = this.prefs.getBoolPref("thumbs.contain");
    document.documentElement.classList[containThumbs ? "add" : "remove"]("containThumbs");

    this.removeBackgroundButton.disabled = !this.backgroundImageFile.exists();
  },
  observe: function(aSubject, aTopic, aData) {
    switch (aData) {
    case "background":
      this.updateUI();
      break;
    case "backgroundColor":
      break;
    case "thumbnail":
      this.selectedSiteIndex = this._selectedSiteIndex;
      break;
    case "title":
      break;
    }
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference, Ci.nsISupports])
};

let uiElements = {
  "pinURLInput": "options-pinURL-input",
  "tilePreviousRow": "options-previous-row-tile",
  "tilePrevious": "options-previous-tile",
  "tileNext": "options-next-tile",
  "tileNextRow": "options-next-row-tile",
  "siteThumbnail": "options-thumbnail",
  "siteURL": "options-url",
  "browseThumbnailButton": "options-thumbnail-browse",
  "setThumbnailInput": "options-thumbnail-input",
  "setThumbnailButton": "options-thumbnail-set",
  "removeThumbnailButton": "options-thumbnail-remove",
  "captureThumbnailButton": "options-thumbnail-refresh",
  "setBgColourInput": "options-bgcolor-input",
  "setBgColourDisplay": "options-bgcolor-display",
  "setBgColourButton": "options-bgcolor-set",
  "resetBgColourButton": "options-bgcolor-reset",
  "setTitleInput": "options-title-input",
  "resetTitleButton": "options-title-reset",
  "setTitleButton": "options-title-set",
  "setBackgroundInput": "options-bg-input",
  "setBackgroundButton": "options-bg-set",
  "removeBackgroundButton": "options-bg-remove",
  "optionsPane": "options"
};
for (let key in uiElements) {
  let value = uiElements[key];
  XPCOMUtils.defineLazyGetter(newTabTools, key, () => document.getElementById(value));
}

XPCOMUtils.defineLazyGetter(newTabTools, "prefs", function() {
  return Services.prefs.getBranch("extensions.newtabtools.");
});

document.documentElement.addEventListener("click", newTabTools.optionsOnClick.bind(newTabTools), false);
newTabTools.setThumbnailInput.addEventListener("keyup", function() {
  newTabTools.setThumbnailButton.disabled = !/^(file|ftp|http|https):\/\//.exec(this.value);
});
newTabTools.setBgColourInput.addEventListener("change", function() {
  newTabTools.setBgColourDisplay.style.backgroundColor = this.value;
  newTabTools.setBgColourButton.disabled = false;
});
newTabTools.setBackgroundInput.addEventListener("keyup", function() {
  newTabTools.setBackgroundButton.disabled = !/^(file|ftp|http|https):\/\//.exec(this.value);
});

Services.obs.addObserver(newTabTools, "newtabtools-change", true);

newTabTools.updateUI();
newTabTools.selectedSiteIndex = 0;
