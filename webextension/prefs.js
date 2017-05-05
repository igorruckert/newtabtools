/* exported Prefs */
/* globals browser, newTabTools, Grid */
var Prefs = {
	_theme: 'light',
	_opacity: 80,
	_rows: 3,
	_columns: 3,
	_margin: ['small', 'small', 'small', 'small'],
	_spacing: 'small',
	_titleSize: 'small',
	_locked: false,

	init: function() {
		return browser.storage.local.get().then(prefs => {
			this.parsePrefs(prefs);
			browser.storage.onChanged.addListener(this.prefsChanged.bind(this));
		});
	},
	parsePrefs: function(prefs) {
		if (['light', 'dark'].includes(prefs.theme)) {
			this._theme = prefs.theme;
		}
		if (Number.isInteger(prefs.opacity) && prefs.opacity >= 0 && prefs.opacity <= 100) {
			this._opacity = prefs.opacity;
		}
		if (Number.isInteger(prefs.rows) && prefs.rows >= 1 && prefs.rows <= 10) {
			this._rows = prefs.rows;
		}
		if (Number.isInteger(prefs.columns) && prefs.columns >= 1 && prefs.columns <= 10) {
			this._columns = prefs.columns;
		}
		if (Array.isArray(prefs.margin) && prefs.margin.length == 4) {
			this._margin = prefs.margin;
		}
		if (['small', 'medium', 'large'].includes(prefs.spacing)) {
			this._spacing = prefs.spacing;
		}
		if (['hidden', 'small', 'medium', 'large'].includes(prefs.titleSize)) {
			this._titleSize = prefs.titleSize;
		}
		if ('locked' in prefs) {
			this._locked = prefs.locked === true;
		}
	},
	prefsChanged: function(changes) {
		let prefs = Object.create(null);
		for (let [name, change] of Object.entries(changes)) {
			if (change.newValue != change.oldValue) {
				prefs[name] = change.newValue;
			}
		}
		this.parsePrefs(prefs);

		let keys = Object.keys(prefs);
		newTabTools.updateUI(keys);
		if (keys.includes('rows') || keys.includes('columns')) {
			Grid.refresh();
		}
	},
	getPrefsFromOldExtension: function() {
		return browser.runtime.sendMessage('prefs').then(function(result) {
			return browser.storage.local.set(result);
		});
	},
	get theme() {
		return this._theme;
	},
	get opacity() {
		return this._opacity;
	},
	get rows() {
		return this._rows;
	},
	get columns() {
		return this._columns;
	},
	get margin() {
		return this._margin;
	},
	get spacing() {
		return this._spacing;
	},
	get titleSize() {
		return this._titleSize;
	},
	get locked() {
		return this._locked;
	},
	set theme(value) {
		browser.storage.local.set({ theme: value });
	},
	set opacity(value) {
		browser.storage.local.set({ opacity: value });
	},
	set rows(value) {
		browser.storage.local.set({ rows: value });
	},
	set columns(value) {
		browser.storage.local.set({ columns: value });
	},
	set margin(value) {
		browser.storage.local.set({ margin: value });
	},
	set spacing(value) {
		browser.storage.local.set({ spacing: value });
	},
	set titleSize(value) {
		browser.storage.local.set({ titleSize: value });
	},
	set locked(value) {
		browser.storage.local.set({ locked: value });
	}
};
