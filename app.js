(() => {
  "use strict";

  const STORAGE_KEY = "fz-bus-sign-studio-v1";
  const RUNTIME_CONFIG = window.BUS_SIGN_CONFIG || {};
  const DEMO_ROUTE = "K6";
  const DEMO_STATIONS = [
    "福建理工大学",
    "福建理工大学南区",
    "学府南路",
    "广贤路",
    "大学城师大西门",
    "公交大学城总站",
    "高新区管委会",
    "高新大道",
    "蔗洲安置房",
    "福建省档案馆（建平村）",
    "建平村（根雕街）",
    "橘园洲",
    "上浦路口",
    "干休所",
    "西禅寺",
    "福大东门",
    "凤凰池",
    "西洪凤里"
  ];

  const DEMO_ICON_STATIONS = new Set([
    "公交大学城总站",
    "高新区管委会",
    "高新大道"
  ]);

  const COMPANY_META = {
    fuzhou: {
      label: "福州公交集团",
      short: "集团",
      color: "#0e9281",
      rgb: "14 146 129"
    },
    kangchi: {
      label: "康驰集团",
      short: "康驰",
      color: "#876479",
      rgb: "135 100 121"
    },
    minyun: {
      label: "闽运交通集团",
      short: "闽运",
      color: "#025891",
      rgb: "2 88 145"
    }
  };

  const EXPRESS_META = {
    label: "福州公交集团 · 快线",
    short: "快线",
    color: "#003fa2",
    rgb: "0 63 162"
  };

  // 康驰集团运营的常规线路（按线路号自动识别）。
  const KANGCHI_ROUTE_NUMBERS = new Set([
    3, 4, 6, 9, 13, 18, 19, 25, 27, 29,
    122, 124, 125, 126, 128, 129, 148,
    167, 168, 169, 170, 171, 181, 182, 183,
    186, 187, 188, 190, 192, 196, 197, 202,
    205, 215, 216
  ]);
  const KANGCHI_FEEDER_NUMBERS = new Set([1, 2, 5, 8, 17, 20, 23]);
  const MINYUN_FEEDER_NUMBERS = new Set([15, 18, 22, 24, 28, 31]);
  const FACILITY_SEARCH_RADIUS = 1000;
  const FACILITY_THRESHOLD = 200;
  const FACILITY_SCAN_VERSION = 3;
  const FACILITY_SEARCH_TYPE = "150500|150501|090100|090101|090102|090103";
  const DETAIL_FACILITY_CACHE_KEY = "fz-bus-sign-facility-cache-v1";
  const DETAIL_FACILITY_CACHE_VERSION = 2;
  const DETAIL_FACILITY_CACHE_LIMIT = 3000;
  const DETAIL_FACILITY_QUERY_LIMIT = 260;
  const FACILITY_SEARCH_INTERVAL = 520;
  const FACILITY_PAGE_SIZE = 25;

  function normalizeRouteNumber(value) {
    return String(value || "")
      .trim()
      .replace(/路(?=快线|区间)/g, "");
  }

  function routeLookupKeyword(value) {
    return normalizeRouteNumber(value).replace(/(快线|区间)$/i, "");
  }

  function routeIsK(value) {
    return /^K/i.test(normalizeRouteNumber(value));
  }

  function detectCompany(routeNumber) {
    const route = String(routeNumber || "").trim().replace(/\s+/g, "");
    if (!route) return null;

    const feeder = route.match(/^地铁接驳(\d+)/);
    if (feeder) {
      const feederNumber = Number(feeder[1]);
      if (KANGCHI_FEEDER_NUMBERS.has(feederNumber)) return "kangchi";
      if (MINYUN_FEEDER_NUMBERS.has(feederNumber)) return "minyun";
    }

    const numeric = route.match(/^(\d{1,4})(?:路|线)?/);
    if (numeric) {
      const text = numeric[1];
      const number = Number(text);
      if (KANGCHI_ROUTE_NUMBERS.has(number)) return "kangchi";
      if (text.length === 3 && /^[3679]/.test(text)) return "minyun";
    }

    return "fuzhou";
  }

  function applyAutoCompany() {
    if (state.companyManual) return;
    const detected = detectCompany(state.routeNumber);
    if (detected && state.company !== detected) {
      state.company = detected;
    }
  }

  function applyAutoExpress() {
    const route = normalizeRouteNumber(state.routeNumber).replace(/\s+/g, "").toUpperCase();
    if (route.startsWith("K")) {
      state.express = true;
      state.expressAuto = true;
      return;
    }
    state.express = false;
    state.expressAuto = false;
  }

  function syncExpressAvailability() {
    if (!els.isExpress) return;
    const available = routeIsK(state.routeNumber);
    if (!available) {
      state.express = false;
      state.expressAuto = false;
    }
    els.isExpress.disabled = !available;
    els.isExpress.title = available ? "" : "只有 K 开头的线路会使用快线蓝底黄字";
  }

  const EXPRESS_NUMBER_COLOR = "#ffee0b";
  const REGULAR_NUMBER_COLOR = "#e2000b";
  const CANVAS_CHINESE_FONT = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';
  const CANVAS_NUMBER_FONT = '"Bahnschrift", "Arial Narrow", "Noto Sans SC", sans-serif';
  const MAX_STATION_GLYPH_SCALE = 1.05;

  const METRO_ICON_SMALL = `<img class="station-metro-icon" src="assets/icon-metro.png" alt="">`;
  const HOSPITAL_ICON_SMALL = `<img class="station-hospital-icon" src="assets/icon-hospital.png" alt="">`;

  const ICON = {
    up: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m0 0L5.5 9.5M10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    down: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10m0 0 4.5-4.5M10 15l-4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    remove: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    expand: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3H3v5M12 3h5v5M8 17H3v-5M12 17h5v-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    collapse: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    metro: METRO_ICON_SMALL,
    hospital: HOSPITAL_ICON_SMALL
  };

  const els = {};
  let state = loadState();
  let saveTimer = null;
  let toastTimer = null;
  let dragId = null;

  let map = null;
  let mapReady = false;
  let mapPanMode = false;
  let mapLoadingTimer = null;
  let facilityScanBusy = false;
  let facilityScanToken = 0;
  let lastFacilitySearchAt = 0;
  let facilitySearchGate = Promise.resolve();
  let directionSwitchBusy = false;
  let stationSearchTimer = null;
  let stationSearchSeq = 0;
  let stationSearchData = [];
  let stationDetailBlob = null;
  let stationDetailObjectUrl = "";
  let stationDetailToken = 0;
  let stationDetailStation = null;
  let stationDetailSides = [];
  let stationDetailSideIndex = 0;
  let lineDetailSearcher = null;
  let lastLineDetailAt = 0;
  let lineDetailGate = Promise.resolve();
  const lineDetailCache = new Map();
  const detailFacilityCache = new Map();
  let detailFacilityCacheTimer = null;
  let placeSearch = null;
  let currentMapKey = "";
  let currentSecurityCode = "";
  let stationMarkers = [];
  let candidateMarkers = [];
  let routePolyline = null;
  let draftLine = null;
  let pendingMarker = null;
  let pendingCenter = null;
  let lastNearbyPois = [];
  let autoRouteLine = null;
  let autoRouteStopMarkers = [];
  let autoRouteMeta = null;
  let autoRouteResults = [];
  let autoRouteBusy = false;
  let renderAssets = {};
  let exportBusy = false;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    ensureSignCanvas();
    els.nearbyList.addEventListener("click", (event) => {
      const button = event.target.closest(".nearby-item");
      if (!button || button.disabled) return;
      const index = Number(button.dataset.poiIndex);
      const poi = lastNearbyPois[index];
      if (poi) addStationFromPoi(poi);
    });
    loadDetailFacilityCache();
    ensureSelectedStation();
    syncControls();
    renderStationList();
    renderSign();
    updateMapFoot();
    fitPreview();
    observePreview();
    updateSaveStatus("修改会自动保存在本机");

    preloadRenderAssets().then(renderSign);
    document.fonts.ready.then(renderSign);

    if (state.settings.key) {
      window.setTimeout(() => connectMap({ silent: true }), 180);
    } else {
      setMapHintVisible(false);
    }

    // Preview and PNG export share the same canvas renderer, so vertical names
    // and both layouts stay pixel-identical at every scale.
    window.__signStudio = {
      exportPng,
      getState: () => state,
      render: renderAll,
      connectMap,
      getMap: () => map
    };
  }

  function cacheElements() {
    const ids = [
      "saveStatus", "btnReset", "btnExportTop", "tabLine", "tabStations",
      "panelLine", "panelStations", "stationTabCount", "routeNumber", "btnSwapDirection",
      "companyGrid", "isExpress", "nextStop", "destStop", "fare",
      "dateStamp", "firstTime", "lastTime", "showIcons", "showDate",
      "stationCount", "btnReverse", "btnAddStation", "stationList",
      "btnClearStations", "btnAutoFacilities", "facilityScanStatus",
      "previewViewport", "previewScaler", "sign",
      "designBadge", "exportScale", "btnExport", "mapStatus", "radiusSelect",
      "btnMapSettings", "mapWrap", "amap", "mapEmpty", "btnConnectMap",
      "mapLoading", "nearbyCard", "nearbySubtitle", "nearbyList",
      "btnCloseNearby", "mapHint", "autoAddNearby", "mapCount",
      "btnFitRoute", "mapSettingsDialog", "mapSettingsForm", "btnCloseSettings",
      "btnCancelSettings", "amapKeyInput", "amapSecurityInput",
      "amapCityInput", "btnSaveSettings", "btnZoomPreview", "previewDialog",
      "previewImage", "btnClosePreview", "btnClosePreviewFoot",
      "btnPreviewDownload", "btnAutoRoute", "autoRouteDialog",
      "autoRouteSubtitle", "autoRouteBody", "btnCloseAutoRoute",
      "btnCloseAutoRouteFoot", "autoRouteStatus", "btnClearAutoRoute",
      "mapCard", "btnMapFullscreen", "btnMapPan", "mapHintText",
      "stationSearch", "stationSearchInput", "stationSearchResults",
      "stationDetailDialog", "stationDetailTitle", "stationDetailSubtitle",
      "stationDetailStatus", "stationDetailImage", "btnCloseStationDetail",
      "btnCloseStationDetailFoot", "btnSwapStationDetail", "btnDownloadStationDetail", "toast"
    ];
    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    els.btnSwapDirection.addEventListener("click", () => switchRouteDirection());

    els.routeNumber.addEventListener("input", () => {
      const normalized = normalizeRouteNumber(els.routeNumber.value);
      if (normalized !== els.routeNumber.value) {
        els.routeNumber.value = normalized;
        els.routeNumber.setSelectionRange(normalized.length, normalized.length);
      }
      state.routeNumber = normalized;
      state.companyManual = false;
      applyAutoCompany();
      applyAutoExpress();
      syncExpressAvailability();
      els.isExpress.checked = state.express;
      renderCompanyState();
      renderSign();
      scheduleSave();
    });

    els.companyGrid.addEventListener("click", (event) => {
      const card = event.target.closest(".company-card");
      if (!card) return;
      state.companyManual = true;
      setCompany(card.dataset.company);
    });

    els.isExpress.addEventListener("change", () => {
      state.express = els.isExpress.checked;
      state.expressAuto = false;
      renderSign();
      renderCompanyState();
      syncMapRoute();
      scheduleSave();
    });

    [["nextStop", "nextStop"], ["destStop", "destStop"], ["fare", "fare"],
      ["dateStamp", "dateStamp"], ["firstTime", "firstTime"], ["lastTime", "lastTime"]
    ].forEach(([id, key]) => {
      els[id].addEventListener("input", () => {
        state[key] = els[id].value;
        renderSign();
        scheduleSave();
      });
    });

    els.showIcons.addEventListener("change", () => {
      state.showIcons = els.showIcons.checked;
      renderSign();
      scheduleSave();
    });

    els.showDate.addEventListener("change", () => {
      state.showDate = els.showDate.checked;
      renderSign();
      scheduleSave();
    });

    els.btnAddStation.addEventListener("click", addBlankStation);
    els.btnReverse.addEventListener("click", reverseStations);
    els.btnAutoFacilities.addEventListener("click", () => autoDetectFacilities());
    els.btnClearStations.addEventListener("click", clearStations);
    els.btnReset.addEventListener("click", resetDemo);

    els.stationList.addEventListener("click", onStationListClick);
    els.stationList.addEventListener("dblclick", onStationListDoubleClick);
    els.stationList.addEventListener("input", onStationListInput);
    els.stationList.addEventListener("keydown", onStationListKeydown);
    bindStationDrag();

    els.stationSearchInput.addEventListener("input", onStationSearchInput);
    els.stationSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideStationSearchResults();
      if (event.key === "Enter") {
        const first = els.stationSearchResults.querySelector(".station-search-item");
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    });
    els.stationSearchResults.addEventListener("click", onStationSearchResultClick);
    document.addEventListener("click", (event) => {
      if (!event.target.closest("#stationSearch")) hideStationSearchResults();
    });
    els.btnCloseStationDetail.addEventListener("click", closeStationDetail);
    els.btnCloseStationDetailFoot.addEventListener("click", closeStationDetail);
    els.btnSwapStationDetail.addEventListener("click", swapStationDetailSide);
    els.stationDetailDialog.addEventListener("close", () => { stationDetailToken += 1; });
    els.btnDownloadStationDetail.addEventListener("click", downloadStationDetail);

    els.radiusSelect.addEventListener("change", () => {
      state.settings.radius = Number(els.radiusSelect.value);
      scheduleSave();
      if (pendingCenter) searchNearby(pendingCenter, { keepCenter: true });
    });

    els.autoAddNearby.addEventListener("change", () => {
      state.settings.autoAdd = els.autoAddNearby.checked;
      scheduleSave();
    });

    els.btnMapSettings.addEventListener("click", openSettingsDialog);
    els.btnConnectMap.addEventListener("click", openSettingsDialog);
    els.btnCloseSettings.addEventListener("click", closeSettingsDialog);
    els.btnCancelSettings.addEventListener("click", closeSettingsDialog);
    els.mapSettingsForm.addEventListener("submit", onSaveSettings);
    els.mapSettingsDialog.addEventListener("click", (event) => {
      if (event.target === els.mapSettingsDialog) closeSettingsDialog();
    });

    els.btnCloseNearby.addEventListener("click", closeNearby);
    els.btnFitRoute.addEventListener("click", fitRoute);

    els.btnAutoRoute.addEventListener("click", openAutoRouteDialog);
    els.btnMapPan.addEventListener("click", () => setMapPanMode(!mapPanMode));
    els.btnMapFullscreen.addEventListener("click", toggleMapFullscreen);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    els.btnCloseAutoRoute.addEventListener("click", closeAutoRouteDialog);
    els.btnCloseAutoRouteFoot.addEventListener("click", closeAutoRouteDialog);
    els.autoRouteDialog.addEventListener("click", (event) => {
      if (event.target === els.autoRouteDialog) closeAutoRouteDialog();
    });
    els.autoRouteBody.addEventListener("click", onAutoRouteBodyClick);
    els.btnClearAutoRoute.addEventListener("click", () => clearAutoRouteOverlay());
    els.routeNumber.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        openAutoRouteDialog();
      }
    });

    els.btnExport.addEventListener("click", () => exportPng(Number(els.exportScale.value)));
    els.btnExportTop.addEventListener("click", () => exportPng(Number(els.exportScale.value)));

    els.btnZoomPreview.addEventListener("click", openPreviewDialog);
    els.btnClosePreview.addEventListener("click", closePreviewDialog);
    els.btnClosePreviewFoot.addEventListener("click", closePreviewDialog);
    els.previewDialog.addEventListener("click", (event) => {
      if (event.target === els.previewDialog) closePreviewDialog();
    });
    els.btnPreviewDownload.addEventListener("click", async () => {
      await exportPng(Number(els.exportScale.value));
      closePreviewDialog();
    });

    window.addEventListener("resize", fitPreview);
  }

  /* ---------------------------------------------------------------------- */
  /* State                                                                  */
  /* ---------------------------------------------------------------------- */

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function defaultState() {
    return {
      routeNumber: DEMO_ROUTE,
      company: "fuzhou",
      companyManual: false,
      express: false,
      expressAuto: false,
      nextStop: "",
      destStop: "",
      fare: "一票制一元",
      dateStamp: "2026.08.31征求",
      firstTime: "06:30",
      lastTime: "21:30",
      showIcons: true,
      showDate: true,
      autoRoute: null,
      selectedStationId: null,
      stations: DEMO_STATIONS.map((name) => ({
        id: makeId(),
        name,
        icon: DEMO_ICON_STATIONS.has(name),
        hospital: false,
        autoMetro: false,
        autoHospital: false,
        facilityScanned: false,
        metroDistance: null,
        hospitalDistance: null,
        lng: null,
        lat: null,
        address: ""
      })),
      settings: {
        key: RUNTIME_CONFIG.amapKey || "",
        security: RUNTIME_CONFIG.amapSecurity || "",
        city: RUNTIME_CONFIG.amapCity || "福州",
        radius: 500,
        autoAdd: false
      }
    };
  }

  function loadState() {
    const base = defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return base;

      const merged = {
        ...base,
        ...saved,
        settings: { ...base.settings, ...(saved.settings || {}) }
      };

      const runtimeKey = String(RUNTIME_CONFIG.amapKey || "").trim();
      const runtimeSecurity = String(RUNTIME_CONFIG.amapSecurity || "").trim();
      if (runtimeKey && !String(merged.settings.key || "").trim()) {
        merged.settings.key = runtimeKey;
        merged.settings.security = runtimeSecurity || merged.settings.security || "";
        merged.settings.city = RUNTIME_CONFIG.amapCity || merged.settings.city || "福州";
      } else if (runtimeKey && merged.settings.key === runtimeKey && !merged.settings.security) {
        merged.settings.security = runtimeSecurity;
      }

      merged.routeNumber = normalizeRouteNumber(merged.routeNumber);
      if (!COMPANY_META[merged.company]) merged.company = "fuzhou";
      merged.companyManual = Boolean(merged.companyManual);
      merged.express = Boolean(merged.express);
      merged.expressAuto = Boolean(merged.expressAuto);
      merged.showIcons = merged.showIcons !== false;
      merged.showDate = merged.showDate !== false;
      merged.firstTime = normalizeTime(merged.firstTime, "06:30");
      merged.lastTime = normalizeTime(merged.lastTime, "21:30");
      merged.autoRoute = normalizeAutoRoute(saved.autoRoute);

      if (!Array.isArray(merged.stations)) merged.stations = base.stations;
      merged.stations = merged.stations
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          id: s.id || makeId(),
          name: typeof s.name === "string" ? s.name : "",
          icon: Boolean(s.icon),
          hospital: Boolean(s.hospital),
          autoMetro: Boolean(s.autoMetro),
          autoHospital: Boolean(s.autoHospital),
          facilityScanned: Boolean(s.facilityScanned),
          facilityVersion: Number(s.facilityVersion) || 0,
          metroDistance: Number.isFinite(Number(s.metroDistance)) && s.metroDistance !== null
            ? Number(s.metroDistance) : null,
          hospitalDistance: Number.isFinite(Number(s.hospitalDistance)) && s.hospitalDistance !== null
            ? Number(s.hospitalDistance) : null,
          lng: Number.isFinite(Number(s.lng)) && s.lng !== null && s.lng !== "" ? Number(s.lng) : null,
          lat: Number.isFinite(Number(s.lat)) && s.lat !== null && s.lat !== "" ? Number(s.lat) : null,
          address: typeof s.address === "string" ? s.address : ""
        }));

      if (!merged.stations.length) merged.stations = base.stations;
      return merged;
    } catch (error) {
      console.warn("Failed to load saved state", error);
      return base;
    }
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        const now = new Date();
        updateSaveStatus(`已保存 · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      } catch (error) {
        updateSaveStatus("本机保存失败");
        console.warn("Failed to save state", error);
      }
    }, 240);
  }

  function updateSaveStatus(text) {
    if (els.saveStatus) els.saveStatus.textContent = text;
  }

  function normalizeTime(value, fallback) {
    const v = String(value || "").trim();
    return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
  }

  function normalizeAutoRoute(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.path)) return null;
    const path = value.path
      .map((point) => [Number(point && point[0]), Number(point && point[1])])
      .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (path.length < 2) return null;

    const stops = Array.isArray(value.stops)
      ? value.stops.map((stop) => ({
        name: String(stop && stop.name ? stop.name : "公交站"),
        lng: Number(stop && stop.lng),
        lat: Number(stop && stop.lat)
      })).filter((stop) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
      : [];

    return {
      name: String(value.name || "公交线路"),
      label: String(value.label || value.name || "公交线路"),
      start: String(value.start || ""),
      end: String(value.end || ""),
      lineId: String(value.lineId || ""),
      oppositeId: String(value.oppositeId || ""),
      path,
      stops,
      mode: value.mode === "route" ? "route" : "stations",
      suppressConnector: true
    };
  }

  /* ---------------------------------------------------------------------- */
  /* UI sync                                                                */
  /* ---------------------------------------------------------------------- */

  function syncControls() {
    state.routeNumber = normalizeRouteNumber(state.routeNumber);
    applyAutoCompany();
    els.routeNumber.value = state.routeNumber;
    syncExpressAvailability();
    els.isExpress.checked = state.express;
    els.nextStop.value = state.nextStop;
    els.destStop.value = state.destStop;
    els.fare.value = state.fare;
    els.dateStamp.value = state.dateStamp;
    els.firstTime.value = state.firstTime;
    els.lastTime.value = state.lastTime;
    els.showIcons.checked = state.showIcons;
    els.showDate.checked = state.showDate;
    els.radiusSelect.value = String(state.settings.radius);
    els.autoAddNearby.checked = Boolean(state.settings.autoAdd);
    renderCompanyState();
  }

  function renderCompanyState() {
    els.companyGrid.querySelectorAll(".company-card").forEach((card) => {
      const active = card.dataset.company === state.company;
      card.setAttribute("aria-checked", active ? "true" : "false");
      card.classList.toggle("is-active", active);
    });

    const activeTheme = state.express ? "express" : state.company;
    document.querySelectorAll("[data-theme-chip]").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.themeChip === activeTheme);
    });

    els.designBadge.textContent = state.express ? "快线 · 蓝底黄字" : "常规线路";
    els.designBadge.classList.toggle("is-express", state.express);
  }

  function setCompany(company) {
    if (!COMPANY_META[company] || state.company === company) return;
    state.company = company;
    renderCompanyState();
    renderSign();
    syncMapRoute();
    scheduleSave();
  }

  function switchTab(name) {
    const isLine = name === "line";
    els.tabLine.classList.toggle("is-active", isLine);
    els.tabStations.classList.toggle("is-active", !isLine);
    els.tabLine.setAttribute("aria-selected", isLine ? "true" : "false");
    els.tabStations.setAttribute("aria-selected", isLine ? "false" : "true");
    els.panelLine.hidden = !isLine;
    els.panelStations.hidden = isLine;
    if (!isLine) renderStationList();
  }

  /* ---------------------------------------------------------------------- */
  /* Sign rendering                                                         */
  /* ---------------------------------------------------------------------- */

  function ensureSignCanvas() {
    if (!els.sign) return null;
    let canvas = els.sign.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = 2560;
      canvas.height = 636;
      canvas.setAttribute("aria-label", "公交站牌预览");
      els.sign.innerHTML = "";
      els.sign.appendChild(canvas);
    }
    return canvas;
  }

  function renderSign() {
    if (!els.sign) return;
    const canvas = ensureSignCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(2, 2);
    drawSignOnCanvas(ctx);
    ctx.restore();

    els.sign.className = `sign${state.express ? " express" : ""}`;
    els.sign.dataset.company = state.company;

    els.nextStop.placeholder = resolveNextStop();
    els.destStop.placeholder = state.stations.length ? state.stations[state.stations.length - 1].name : "终点站";

    if (els.previewDialog && els.previewDialog.open) {
      els.previewImage.src = canvas.toDataURL("image/png");
    }

    updateStationCounts();
  }

  function openPreviewDialog() {
    const canvas = els.sign.querySelector("canvas");
    if (!canvas) return;
    els.previewImage.src = canvas.toDataURL("image/png");
    if (!els.previewDialog.open) els.previewDialog.showModal();
  }

  function closePreviewDialog() {
    if (els.previewDialog.open) els.previewDialog.close();
  }

  function getRouteFontSize(route) {
    const len = Array.from(route).length;
    if (len <= 2) return 108;
    if (len === 3) return 102;
    if (len === 4) return 82;
    if (len === 5) return 64;
    if (len === 6) return 54;
    if (len <= 8) return 42;
    return 34;
  }

  function getStationFontSize(count) {
    if (count <= 18) return 17;
    if (count <= 22) return 16.5;
    if (count <= 26) return 16;
    if (count <= 30) return 15.5;
    if (count <= 36) return 15;
    return 12;
  }

  function stationHeightScale(charCount) {
    if (charCount <= 5) return 1;
    const scaleByChars = {
      6: 0.85,
      7: 0.73,
      8: 0.63,
      9: 0.55,
      10: 0.48,
      11: 0.42,
      12: 0.37
    };
    if (scaleByChars[charCount]) return scaleByChars[charCount];
    let scale = scaleByChars[12];
    for (let count = 13; count <= charCount; count += 1) scale *= 0.9;
    return Math.max(0.2, scale);
  }

  function splitStationName(name) {
    const text = String(name || "未命名").trim();
    // Only a parenthetical group at the very end gets its own column.
    // Parentheses in the middle stay in the main vertical column.
    if (!/[)）]\s*$/.test(text)) return [text, ""];

    let depth = 0;
    let openIndex = -1;
    for (let i = text.length - 1; i >= 0; i -= 1) {
      const char = text[i];
      if (char === ")" || char === "）") depth += 1;
      if (char === "(" || char === "（") {
        depth -= 1;
        if (depth === 0) {
          openIndex = i;
          break;
        }
      }
    }
    if (openIndex <= 0) return [text, ""];
    const main = text.slice(0, openIndex).trim();
    const note = text.slice(openIndex).trim();
    if (!main || !note) return [text, ""];
    return [main, note];
  }

  function isParenChar(char) {
    return char === "（" || char === "(" || char === "）" || char === ")";
  }

  function drawVerticalGlyph(ctx, char, x, y, glyphScale = 1.05) {
    ctx.save();
    ctx.translate(x, y);
    if (isParenChar(char)) {
      ctx.rotate(Math.PI / 2);
      ctx.fillText(char, 0, 0);
    } else {
      // A strong horizontal stretch makes the vertical CJK glyphs read wider.
      ctx.scale(glyphScale, 1);
      ctx.fillText(char, 0, 0);
    }
    ctx.restore();
  }

  function ensureSelectedStation() {
    if (!state.stations.length) {
      state.selectedStationId = null;
      return;
    }
    if (!state.stations.some((station) => station.id === state.selectedStationId)) {
      state.selectedStationId = state.stations[0].id;
    }
  }

  function selectedStationIndex() {
    const index = state.stations.findIndex((station) => station.id === state.selectedStationId);
    return index >= 0 ? index : 0;
  }

  function resolveNextStop() {
    const custom = String(state.nextStop || "").trim();
    if (custom) return custom;
    const index = selectedStationIndex();
    const next = state.stations[index + 1] || state.stations[index];
    return next ? next.name : "—";
  }

  function resolveDestination() {
    const custom = String(state.destStop || "").trim();
    if (custom) return custom;
    return state.stations.length ? state.stations[state.stations.length - 1].name : "—";
  }

  /* ---------------------------------------------------------------------- */
  /* Station list                                                           */
  /* ---------------------------------------------------------------------- */

  function renderStationList() {
    if (!els.stationList) return;

    if (!state.stations.length) {
      els.stationList.innerHTML = `<li class="station-empty">还没有站点，点击「添加」或用下方地图选站。</li>`;
      updateStationCounts();
      return;
    }

    els.stationList.innerHTML = state.stations.map((station, index) => {
      const coordTitle = station.lng != null && station.lat != null
        ? `已定位 · ${Number(station.lng).toFixed(5)}, ${Number(station.lat).toFixed(5)}`
        : "暂无坐标，可用地图选站补全";
      const metroActive = Boolean(station.icon || station.autoMetro);
      const hospitalActive = Boolean(station.hospital || station.autoHospital);
      const metroDistance = Number.isFinite(station.metroDistance) ? Math.round(station.metroDistance) : null;
      const hospitalDistance = Number.isFinite(station.hospitalDistance) ? Math.round(station.hospitalDistance) : null;
      const metroTitle = `${metroActive ? "取消" : "标记"}附近有地铁${metroDistance != null ? `（最近 ${metroDistance} m）` : ""}`;
      const hospitalTitle = `${hospitalActive ? "取消" : "标记"}附近有医院${hospitalDistance != null ? `（最近 ${hospitalDistance} m）` : ""}`;
      const selected = station.id === (state.selectedStationId || state.stations[0]?.id);

      return `<li class="station-row${index === 0 ? " is-first" : ""}${selected ? " is-selected" : ""}" draggable="true" data-id="${escapeHtml(station.id)}" aria-current="${selected ? "true" : "false"}">
        <span class="drag-handle" title="拖动排序" aria-hidden="true">⋮⋮</span>
        <span class="station-index" title="${escapeHtml(`${coordTitle} · 点击设为当前站`)}">${String(index + 1).padStart(2, "0")}</span>
        <input class="station-input" type="text" value="${escapeHtml(station.name)}" data-id="${escapeHtml(station.id)}" aria-label="第 ${index + 1} 站站名" autocomplete="off" spellcheck="false">
        <span class="station-actions">
          <button class="station-action metro-toggle${metroActive ? " is-active" : ""}" type="button" data-action="icon" data-index="${index}" title="${metroTitle}" aria-label="切换附近地铁站标志" aria-pressed="${metroActive ? "true" : "false"}">${ICON.metro}</button>
          <button class="station-action hospital-toggle${hospitalActive ? " is-active" : ""}" type="button" data-action="hospital" data-index="${index}" title="${hospitalTitle}" aria-label="切换附近医院标志" aria-pressed="${hospitalActive ? "true" : "false"}">${ICON.hospital}</button>
          <button class="station-action" type="button" data-action="up" data-index="${index}" title="上移" aria-label="上移" ${index === 0 ? "disabled" : ""}>${ICON.up}</button>
          <button class="station-action" type="button" data-action="down" data-index="${index}" title="下移" aria-label="下移" ${index === state.stations.length - 1 ? "disabled" : ""}>${ICON.down}</button>
          <button class="station-action remove" type="button" data-action="remove" data-index="${index}" title="删除站点" aria-label="删除站点">${ICON.remove}</button>
        </span>
      </li>`;
    }).join("");

    updateStationCounts();
  }

  function updateStationCounts() {
    const count = state.stations.length;
    if (els.stationCount) els.stationCount.textContent = String(count);
    if (els.stationTabCount) els.stationTabCount.textContent = String(count);
  }

  function onStationListInput(event) {
    const input = event.target.closest(".station-input");
    if (!input) return;
    const station = state.stations.find((s) => s.id === input.dataset.id);
    if (!station) return;
    station.name = input.value;
    renderSign();
    scheduleSave();
  }

  function onStationListClick(event) {
    const button = event.target.closest(".station-action");
    if (!button) {
      const row = event.target.closest(".station-row");
      if (row && !event.target.closest(".station-input, .drag-handle")) {
        selectStation(row.dataset.id);
      }
      return;
    }
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || !state.stations[index]) return;
    const action = button.dataset.action;

    if (action === "icon") {
      const station = state.stations[index];
      station.icon = !(station.icon || station.autoMetro);
      station.autoMetro = false;
      renderStationList();
      renderSign();
      scheduleSave();
      return;
    }

    if (action === "hospital") {
      const station = state.stations[index];
      station.hospital = !(station.hospital || station.autoHospital);
      station.autoHospital = false;
      renderStationList();
      renderSign();
      scheduleSave();
      return;
    }

    if (action === "up" && index > 0) {
      swapStations(index, index - 1);
      return;
    }

    if (action === "down" && index < state.stations.length - 1) {
      swapStations(index, index + 1);
      return;
    }

    if (action === "remove") {
      if (state.stations.length <= 1) {
        showToast("至少保留一个站点");
        return;
      }
      const removed = state.stations.splice(index, 1)[0];
      ensureSelectedStation();
      renderAll();
      scheduleSave();
      showToast(`已删除「${removed.name || "未命名站点"}」`);
    }
  }

  function selectStation(id) {
    if (!state.stations.some((station) => station.id === id)) return;
    state.selectedStationId = id;
    state.nextStop = "";
    if (els.nextStop) els.nextStop.value = "";
    renderStationList();
    renderSign();
    syncMapRoute();
    scheduleSave();
  }

  function swapStations(a, b) {
    const [item] = state.stations.splice(a, 1);
    state.stations.splice(b, 0, item);
    renderAll();
    scheduleSave();
  }

  function onStationListKeydown(event) {
    const input = event.target.closest(".station-input");
    if (!input || event.isComposing) return;

    if (event.key === "Enter") {
      event.preventDefault();
      const index = state.stations.findIndex((s) => s.id === input.dataset.id);
      if (index === state.stations.length - 1) {
        addBlankStation();
      } else {
        const nextInput = els.stationList.querySelectorAll(".station-input")[index + 1];
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
      return;
    }

    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const index = state.stations.findIndex((s) => s.id === input.dataset.id);
      if (event.key === "ArrowUp" && index > 0) {
        event.preventDefault();
        swapStations(index, index - 1);
      }
      if (event.key === "ArrowDown" && index < state.stations.length - 1) {
        event.preventDefault();
        swapStations(index, index + 1);
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Station search + station detail                                        */
  /* ---------------------------------------------------------------------- */

  function ensureStationSearchPlugin() {
    return new Promise((resolve) => {
      if (!window.AMap) {
        resolve(false);
        return;
      }
      if (typeof AMap.StationSearch === "function") {
        resolve(true);
        return;
      }
      AMap.plugin(["AMap.StationSearch"], () => resolve(typeof AMap.StationSearch === "function"));
    });
  }

  function stationSearchCity() {
    return state.settings.city === "福州" ? "0591" : (state.settings.city || "0591");
  }

  async function fetchStationInfos(keyword) {
    const ready = await ensureStationSearchPlugin();
    if (!ready) return [];
    return new Promise((resolve) => {
      try {
        const searcher = new AMap.StationSearch({
          pageIndex: 1,
          pageSize: 20,
          city: stationSearchCity()
        });
        searcher.search(keyword, (status, result) => {
          resolve(status === "complete" && result && Array.isArray(result.stationInfo)
            ? result.stationInfo
            : []);
        });
      } catch (error) {
        console.warn("Station search failed", error);
        resolve([]);
      }
    });
  }

  function hideStationSearchResults() {
    if (els.stationSearchResults) els.stationSearchResults.hidden = true;
  }

  function renderStationSearchResults(stations, message = "") {
    if (!els.stationSearchResults) return;
    if (message) {
      els.stationSearchResults.innerHTML = `<div class="station-search-empty">${escapeHtml(message)}</div>`;
      els.stationSearchResults.hidden = false;
      return;
    }
    if (!stations.length) {
      els.stationSearchResults.innerHTML = `<div class="station-search-empty">没有找到公交站</div>`;
      els.stationSearchResults.hidden = false;
      return;
    }
    els.stationSearchResults.innerHTML = stations.map((station, index) => `
      <button class="station-search-item" type="button" data-index="${index}">
        <strong>${escapeHtml(station.name || "公交站")}</strong>
        <small>${(station.buslines || []).length} 条线路 · 点击查看详情</small>
      </button>
    `).join("");
    els.stationSearchResults.hidden = false;
  }

  function onStationSearchInput() {
    window.clearTimeout(stationSearchTimer);
    const keyword = String(els.stationSearchInput.value || "").trim();
    if (!keyword) {
      hideStationSearchResults();
      return;
    }
    renderStationSearchResults([], "正在搜索…");
    const seq = ++stationSearchSeq;
    stationSearchTimer = window.setTimeout(async () => {
      const stations = await fetchStationInfos(keyword);
      if (seq !== stationSearchSeq) return;
      stationSearchData = stations;
      renderStationSearchResults(stations);
    }, 480);
  }

  function onStationSearchResultClick(event) {
    const button = event.target.closest(".station-search-item");
    if (!button) return;
    const station = stationSearchData[Number(button.dataset.index)];
    if (!station) return;
    hideStationSearchResults();
    openStationDetail(station);
  }

  function onStationListDoubleClick(event) {
    if (event.target.closest(".station-input, .station-action, .drag-handle")) return;
    const row = event.target.closest(".station-row");
    if (!row) return;
    const station = state.stations.find((item) => item.id === row.dataset.id);
    if (!station) return;
    selectStation(station.id);
    openStationDetail(station);
  }

  async function resolveStationDetailInfo(input) {
    if (input && Array.isArray(input.buslines) && input.buslines.length) return input;
    const name = String(input && input.name || "").trim();
    if (!name) return input;
    const stations = await fetchStationInfos(name);
    if (!stations.length) return input;

    const hasCoords = input.lng != null && input.lat != null
      && Number.isFinite(Number(input.lng)) && Number.isFinite(Number(input.lat));
    if (hasCoords) {
      let best = null;
      stations.forEach((station) => {
        if (station.lng == null || station.lat == null) return;
        const distance = distanceMeters(Number(input.lng), Number(input.lat), Number(station.lng), Number(station.lat));
        if (!best || distance < best.distance) best = { station, distance };
      });
      if (best) return best.station;
    }

    const target = name.replace(/[（(]公交站[）)]/g, "").replace(/\s+/g, "");
    return stations.find((station) =>
      String(station.name || "").replace(/[（(]公交站[）)]/g, "").replace(/\s+/g, "") === target
    ) || stations[0];
  }

  function stationLineInfo(line) {
    const name = String(line && line.name || "公交线路");
    const base = name.split(/[（(]/)[0].trim().toUpperCase();
    const route = normalizeRouteNumber(base).replace(/路$/, "");
    const numericMatch = route.match(/^(\d+)/);
    const numeric = Boolean(numericMatch) && !/^K/i.test(route);
    let start = String(line && line.start_stop || "").trim();
    let end = String(line && line.end_stop || "").trim();
    if (!start || !end) {
      const direction = name.match(/\(([^()]*?)--([^()]*?)\)\s*$/);
      if (direction) {
        start = start || direction[1].trim();
        end = end || direction[2].trim();
      }
    }
    return {
      name,
      route,
      numeric,
      number: numericMatch ? Number(numericMatch[1]) : NaN,
      start,
      end,
      company: detectCompany(route)
    };
  }

  function prepareStationLines(lines) {
    const seen = new Set();
    const all = [];
    (Array.isArray(lines) ? lines : []).forEach((line) => {
      const info = stationLineInfo(line);
      const key = `${info.name}|${info.start}|${info.end}`;
      if (seen.has(key)) return;
      seen.add(key);
      info.id = line.id || "";
      all.push(info);
    });

    const k = all.filter((line) => /^K\d/i.test(line.route))
      .sort((a, b) => (parseInt(a.route.replace(/\D/g, ""), 10) || 0)
        - (parseInt(b.route.replace(/\D/g, ""), 10) || 0)
        || a.route.localeCompare(b.route, "zh-CN"));
    const numeric = all.filter((line) => line.numeric)
      .sort((a, b) => a.number - b.number || a.route.localeCompare(b.route, "zh-CN"));
    const special = all.filter((line) => !line.numeric && !k.includes(line))
      .sort((a, b) => a.route.localeCompare(b.route, "zh-CN"));
    return { all: [...k, ...numeric, ...special], k, numeric, special };
  }

  function fitCanvasText(ctx, text, maxWidth, size, weight = 700, family = CANVAS_CHINESE_FONT) {
    let current = size;
    while (current > 10) {
      ctx.font = `${weight} ${current}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) break;
      current -= 1;
    }
    return current;
  }

  function rateLimitLineDetailSearch() {
    const run = lineDetailGate.then(async () => {
      const wait = Math.max(0, lastLineDetailAt + 520 - Date.now());
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      lastLineDetailAt = Date.now();
    });
    lineDetailGate = run.catch(() => {});
    return run;
  }

  async function fetchLineDetailById(id) {
    if (!id) return null;
    if (lineDetailCache.has(id)) return lineDetailCache.get(id);
    if (!window.AMap) return null;
    await new Promise((resolve) => {
      if (typeof AMap.LineSearch === "function") resolve();
      else AMap.plugin(["AMap.LineSearch"], resolve);
    });
    await rateLimitLineDetailSearch();
    if (typeof AMap.LineSearch !== "function") return null;

    const detail = await new Promise((resolve) => {
      try {
        if (!lineDetailSearcher) {
          lineDetailSearcher = new AMap.LineSearch({
            pageIndex: 1,
            pageSize: 1,
            city: stationSearchCity(),
            extensions: "all"
          });
        }
        lineDetailSearcher.searchById(id, (status, result) => {
          resolve(status === "complete" && result && result.lineInfo
            ? (result.lineInfo[0] || null)
            : null);
        });
      } catch (error) {
        console.warn("Line detail lookup failed", id, error);
        resolve(null);
      }
    });
    lineDetailCache.set(id, detail);
    return detail;
  }

  function normalizeStationMatchName(value) {
    return String(value || "")
      .replace(/[（(]公交站[）)]/g, "")
      .replace(/\s+/g, "")
      .replace(/站$/, "");
  }

  function normalizeDisplayStationName(name) {
    let text = String(name || "").trim();
    // "(公交站)" is AMap's generic station suffix, not part of the name.
    // Remove it first; "尤溪洲（西）公交站" has no parentheses around 公交站
    // and therefore keeps its final 站.
    text = text.replace(/\s*[（(]公交站[）)]\s*$/g, "").trim();
    // Strip a redundant trailing "站", but keep proper terminal compounds.
    const keepSuffix = /^公交.+站$|(公交站|火车站|火车[^站]*站|地铁站|地铁[^站]*站|动车站|客运[^站]*站|汽车站|总站|首末站)$/;
    if (/站$/.test(text) && !keepSuffix.test(text)) text = text.slice(0, -1);
    return text || "公交站";
  }

  function stationDisplayName(station) {
    return normalizeDisplayStationName(station && station.name);
  }

  function detailStopsForLine(detail, station) {
    const viaStops = Array.isArray(detail.via_stops) ? detail.via_stops.slice() : [];
    if (viaStops.length < 2) return null;
    viaStops.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));

    const target = normalizeStationMatchName(station.name);
    const hasCoords = station.lng != null && station.lat != null
      && Number.isFinite(Number(station.lng)) && Number.isFinite(Number(station.lat));

    // A line only belongs in this station detail when this station name really
    // appears in its stop sequence. Never substitute a random nearest stop.
    const matches = [];
    viaStops.forEach((stop, index) => {
      if (normalizeStationMatchName(stop.name) === target) matches.push(index);
    });
    if (!matches.length) return null;

    let selectedIndex = matches[0];
    if (hasCoords) {
      let bestDistance = Infinity;
      matches.forEach((index) => {
        const stop = viaStops[index];
        if (!stop.location) return;
        const distance = distanceMeters(
          Number(station.lng), Number(station.lat),
          Number(stop.location.lng), Number(stop.location.lat)
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          selectedIndex = index;
        }
      });
    }

    const locatedStops = viaStops
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop }) => stop && stop.location);
    const selectedDisplayName = normalizeDisplayStationName(station.name);
    const stops = locatedStops.map(({ stop, index }) => ({
      id: `detail-${detail.id || "line"}-${index}`,
      name: index === selectedIndex
        ? selectedDisplayName
        : normalizeDisplayStationName(stop.name),
      icon: false,
      hospital: false,
      autoMetro: false,
      autoHospital: false,
      facilityScanned: false,
      metroDistance: null,
      hospitalDistance: null,
      lng: Number(stop.location.lng),
      lat: Number(stop.location.lat),
      address: ""
    }));
    if (stops.length < 2) return null;
    if (!locatedStops.some(({ index }) => index === selectedIndex)) {
      selectedIndex = locatedStops[0].index;
    }
    return {
      stops,
      selectedId: `detail-${detail.id || "line"}-${selectedIndex}`
    };
  }

  function detailFacilityKey(stop) {
    return `${Number(stop.lng).toFixed(5)},${Number(stop.lat).toFixed(5)}`;
  }

  function loadDetailFacilityCache() {
    try {
      const raw = localStorage.getItem(DETAIL_FACILITY_CACHE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.version !== DETAIL_FACILITY_CACHE_VERSION || !data.entries) return;
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      Object.entries(data.entries).forEach(([key, value]) => {
        if (!value || !value.t || value.t < cutoff) return;
        detailFacilityCache.set(key, value);
      });
    } catch (error) {
      console.warn("Facility cache load failed", error);
    }
  }

  function persistDetailFacilityCache() {
    window.clearTimeout(detailFacilityCacheTimer);
    detailFacilityCacheTimer = window.setTimeout(() => {
      try {
        const entries = [...detailFacilityCache.entries()]
          .sort((a, b) => (b[1].t || 0) - (a[1].t || 0))
          .slice(0, DETAIL_FACILITY_CACHE_LIMIT);
        localStorage.setItem(DETAIL_FACILITY_CACHE_KEY, JSON.stringify({
          version: DETAIL_FACILITY_CACHE_VERSION,
          entries: Object.fromEntries(entries)
        }));
      } catch (error) {
        console.warn("Facility cache save failed", error);
      }
    }, 400);
  }

  function cacheDetailFacility(key, facility) {
    if (!key || !facility) return;
    detailFacilityCache.set(key, { ...facility, t: Date.now() });
    persistDetailFacilityCache();
  }

  function knownFacilityForStop(stop) {
    if (stop.lng == null || stop.lat == null) return null;
    const known = state.stations.find((station) => {
      if (station.lng == null || station.lat == null) return false;
      return distanceMeters(Number(station.lng), Number(station.lat), Number(stop.lng), Number(stop.lat)) < 30;
    });
    if (!known) return null;
    if (!known.facilityScanned && !known.icon && !known.hospital && !known.autoMetro && !known.autoHospital) {
      return null;
    }
    if (known.facilityScanned && Number(known.facilityVersion || 0) < FACILITY_SCAN_VERSION) {
      return null;
    }
    return {
      autoMetro: Boolean(known.icon || known.autoMetro),
      autoHospital: Boolean(known.hospital || known.autoHospital),
      metroDistance: known.metroDistance,
      hospitalDistance: known.hospitalDistance
    };
  }

  async function drawStationDetailCanvas(station, lines, token, onProgress, sideIndex = 0) {
    const groups = prepareStationLines(lines);
    if (!groups.all.length) return null;

    const details = [];
    for (let index = 0; index < groups.all.length; index += 1) {
      if (token !== stationDetailToken) return null;
      if (onProgress) onProgress("lines", index + 1, groups.all.length);
      const entry = groups.all[index];
      const detail = await fetchLineDetailById(entry.id);
      if (token !== stationDetailToken) return null;
      if (!detail) continue;
      const stopData = detailStopsForLine(detail, station);
      if (!stopData) continue;
      details.push({ entry, detail, stopData });
    }

    if (!details.length) return null;

    let skippedFacilityStops = 0;
    if (state.showIcons) {
      const uniqueStops = new Map();
      details.forEach(({ stopData }) => {
        stopData.stops.forEach((stop) => {
          const key = detailFacilityKey(stop);
          if (!uniqueStops.has(key)) uniqueStops.set(key, []);
          uniqueStops.get(key).push(stop);
        });
      });

      const keys = [...uniqueStops.keys()];
      let newFacilityQueries = 0;
      for (let index = 0; index < keys.length; index += 1) {
        if (token !== stationDetailToken) return null;
        if (onProgress) onProgress("facilities", index + 1, keys.length);
        const stops = uniqueStops.get(keys[index]);
        let facility = detailFacilityCache.get(keys[index]);
        if (!facility) {
          facility = knownFacilityForStop(stops[0]);
          if (facility) {
            cacheDetailFacility(keys[index], facility);
          }
        }
        if (!facility) {
          if (newFacilityQueries >= DETAIL_FACILITY_QUERY_LIMIT) {
            skippedFacilityStops += stops.length;
            continue;
          }
          newFacilityQueries += 1;
          const center = [Number(stops[0].lng), Number(stops[0].lat)];
          const result = await searchNearbyFacilitiesWithRetry(center);
          if (token !== stationDetailToken) return null;
          facility = {
            autoMetro: Boolean(result.metro && result.metro.distance < FACILITY_THRESHOLD),
            autoHospital: Boolean(result.hospital && result.hospital.distance < FACILITY_THRESHOLD),
            metroDistance: result.metro ? Math.round(result.metro.distance) : null,
            hospitalDistance: result.hospital ? Math.round(result.hospital.distance) : null
          };
          if (!result.error) cacheDetailFacility(keys[index], facility);
        }
        stops.forEach((stop) => {
          stop.autoMetro = facility.autoMetro;
          stop.autoHospital = facility.autoHospital;
          stop.metroDistance = facility.metroDistance;
          stop.hospitalDistance = facility.hospitalDistance;
        });
      }
    }

    if (token !== stationDetailToken) return null;
    if (onProgress) onProgress("render", 0, 0);

    const width = 1280;
    const headerHeight = 96;
    const panelHeight = 318;
    const panelGap = 8;
    const footerHeight = 24;
    const height = headerHeight + details.length * (panelHeight + panelGap) + footerHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.ceil(height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#eef2ef";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#0c3b33";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#a7d7cb";
    ctx.font = `700 13px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("公交站牌 · 车站详情", 42, 30);

    ctx.fillStyle = "#ffffff";
    const titleText = stationDisplayName(station);
    const titleSize = fitCanvasText(ctx, titleText, 900, 38);
    ctx.font = `700 ${titleSize}px ${CANVAS_CHINESE_FONT}`;
    ctx.fillText(titleText, 42, 70);

    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = `400 14px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(`第 ${sideIndex + 1} 侧 · ${details.length} 条线路 · K线 / 数字线 / 特殊线`, 1238, 60);

    const originalState = state;
    let y = headerHeight;
    try {
      details.forEach(({ entry, detail, stopData }) => {
        const info = stationLineInfo(detail);
        const times = extractLineTimes(detail);
        const lineState = {
          ...originalState,
          routeNumber: info.route,
          company: info.company,
          express: /^K/i.test(info.route),
          stations: stopData.stops,
          selectedStationId: stopData.selectedId,
          nextStop: "",
          destStop: "",
          firstTime: times.first || originalState.firstTime,
          lastTime: times.last || originalState.lastTime,
          fare: formatFareFromLine(detail) || originalState.fare,
          autoRoute: null
        };
        state = lineState;
        ctx.save();
        ctx.translate(0, y);
        drawSignOnCanvas(ctx);
        ctx.restore();
        y += panelHeight;
        if (panelGap) {
          ctx.fillStyle = "#eef2ef";
          ctx.fillRect(0, y, width, panelGap);
          y += panelGap;
        }
      });
    } finally {
      state = originalState;
    }

    ctx.fillStyle = "#eef2ef";
    ctx.fillRect(0, y, width, footerHeight);
    ctx.fillStyle = "#93a49a";
    ctx.textAlign = "left";
    ctx.font = `400 11px ${CANVAS_CHINESE_FONT}`;
    ctx.fillText("站牌工坊 · 数据来源：高德地图", 42, y + 16);

    return { canvas, groups, renderedCount: details.length, skippedFacilityStops };
  }

  function splitStationSides(lines) {
    const groups = new Map();
    (Array.isArray(lines) ? lines : []).forEach((line) => {
      const info = stationLineInfo(line);
      const key = info.route || info.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ line, info });
    });

    const sideA = [];
    const sideB = [];
    groups.forEach((group) => {
      group.sort((a, b) => a.info.name.localeCompare(b.info.name, "zh-CN"));
      sideA.push(group[0].line);
      sideB.push((group[1] || group[0]).line);
    });
    return [sideA, sideB];
  }

  function stationSideSignature(lines) {
    return (lines || []).map((line) => line.id || line.name).sort().join("|");
  }

  async function renderStationDetailSide(token, sideIndex) {
    const station = stationDetailStation;
    const lines = stationDetailSides[sideIndex] || [];
    if (!station || !lines.length) return;

    els.stationDetailStatus.hidden = false;
    els.stationDetailStatus.textContent = `正在获取第 ${sideIndex + 1} 侧线路的站牌…`;
    els.stationDetailImage.hidden = true;
    els.btnDownloadStationDetail.disabled = true;
    els.btnSwapStationDetail.disabled = true;

    const rendered = await drawStationDetailCanvas(station, lines, token, (stage, done, total) => {
      if (token !== stationDetailToken) return;
      if (stage === "lines") {
        const remaining = Math.max(0, total - done);
        els.stationDetailStatus.textContent =
          `正在获取第 ${sideIndex + 1} 侧线路 ${done}/${total}… `
          + `预计剩余 ${formatRemainingTime(remaining * 0.6)}（高德限速）`;
      } else if (stage === "facilities") {
        const remaining = Math.max(0, total - done);
        els.stationDetailStatus.textContent =
          `正在检测站点设施 ${done}/${total}… `
          + `预计剩余 ${formatRemainingTime(remaining * 0.55)}（2 QPS 限速）`;
      } else {
        els.stationDetailStatus.textContent = "正在生成站牌长图…预计几秒";
      }
    }, sideIndex);
    if (token !== stationDetailToken) return;
    if (!rendered) throw new Error("No lines");
    if (!els.stationDetailDialog.open) return;

    els.stationDetailSubtitle.textContent =
      `第 ${sideIndex + 1} 侧 · ${rendered.renderedCount} 条线路 · K线在前，数字线、特殊线依次排列`
      + (rendered.skippedFacilityStops
        ? `；${rendered.skippedFacilityStops} 个站点因单次上限未检测，重新打开可继续补全`
        : "");
    const same = stationSideSignature(stationDetailSides[0]) === stationSideSignature(stationDetailSides[1]);
    els.btnSwapStationDetail.disabled = same;
    els.btnSwapStationDetail.title = same ? "这个站没有可切换的另一侧" : "切换公交站另一侧";

    const blob = await new Promise((resolve) => rendered.canvas.toBlob(resolve, "image/png"));
    if (token !== stationDetailToken) return;
    if (!blob) throw new Error("Canvas export failed");
    stationDetailBlob = blob;
    stationDetailObjectUrl = URL.createObjectURL(blob);
    els.stationDetailImage.src = stationDetailObjectUrl;
    els.stationDetailImage.alt = `${station.name || "公交站"} 第 ${sideIndex + 1} 侧线路站牌长图`;
    els.stationDetailImage.hidden = false;
    els.stationDetailStatus.hidden = true;
    els.btnDownloadStationDetail.disabled = false;
  }

  async function openStationDetail(input) {
    if (!els.stationDetailDialog) return;
    hideStationSearchResults();
    const token = ++stationDetailToken;

    if (stationDetailObjectUrl) {
      URL.revokeObjectURL(stationDetailObjectUrl);
      stationDetailObjectUrl = "";
    }
    stationDetailBlob = null;
    stationDetailStation = null;
    stationDetailSides = [];
    stationDetailSideIndex = 0;
    els.btnSwapStationDetail.disabled = true;
    els.stationDetailTitle.textContent = input && input.name
      ? (normalizeStationMatchName(input.name) || input.name)
      : "车站详情";
    els.stationDetailSubtitle.textContent = "正在查询经过这个站的全部公交线路…";
    els.stationDetailStatus.hidden = false;
    els.stationDetailStatus.textContent = "正在查询经过线路…";
    els.stationDetailImage.hidden = true;
    els.stationDetailImage.removeAttribute("src");
    els.btnDownloadStationDetail.disabled = true;
    if (!els.stationDetailDialog.open) els.stationDetailDialog.showModal();

    try {
      const station = await resolveStationDetailInfo(input || {});
      if (token !== stationDetailToken) return;
      const lines = station && Array.isArray(station.buslines) ? station.buslines : [];
      if (!lines.length) {
        els.stationDetailStatus.textContent = "高德没有返回这个站的线路数据，请换一个同名站点再试。";
        els.stationDetailSubtitle.textContent = "未找到经过线路";
        return;
      }

      stationDetailStation = station;
      stationDetailSides = splitStationSides(lines);
      stationDetailSideIndex = 0;
      els.stationDetailTitle.textContent = stationDisplayName(station) || "车站详情";
      await renderStationDetailSide(token, 0);
    } catch (error) {
      if (token !== stationDetailToken) return;
      console.warn("Station detail failed", error);
      els.stationDetailStatus.hidden = false;
      els.stationDetailStatus.textContent = "车站详情生成失败，请检查高德 Key 或稍后重试。";
      els.stationDetailSubtitle.textContent = "查询失败";
    }
  }

  async function swapStationDetailSide() {
    if (!stationDetailStation || stationDetailSides.length < 2) return;
    const nextIndex = 1 - stationDetailSideIndex;
    if (!stationDetailSides[nextIndex] || !stationDetailSides[nextIndex].length) return;
    const token = ++stationDetailToken;
    stationDetailSideIndex = nextIndex;
    els.btnSwapStationDetail.disabled = true;
    try {
      await renderStationDetailSide(token, nextIndex);
    } catch (error) {
      if (token !== stationDetailToken) return;
      console.warn("Station side switch failed", error);
      els.stationDetailStatus.hidden = false;
      els.stationDetailStatus.textContent = "这一侧线路生成失败，请稍后重试。";
      els.btnSwapStationDetail.disabled = false;
    }
  }

  function closeStationDetail() {
    stationDetailToken += 1;
    els.stationDetailDialog.close();
  }

  function downloadStationDetail() {
    if (!stationDetailBlob) return;
    const name = String(els.stationDetailTitle.textContent || "车站详情").replace(/[\\/:*?"<>|]/g, "_");
    const link = document.createElement("a");
    link.href = stationDetailObjectUrl;
    link.download = `${name}_第${stationDetailSideIndex + 1}侧_车站线路.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function addBlankStation() {
    const station = {
      id: makeId(),
      name: "新站点",
      icon: false,
      hospital: false,
      autoMetro: false,
      autoHospital: false,
      facilityScanned: false,
      metroDistance: null,
      hospitalDistance: null,
      lng: null,
      lat: null,
      address: ""
    };
    state.stations.push(station);
    renderAll();
    scheduleSave();
    window.requestAnimationFrame(() => {
      const input = els.stationList.querySelector(`.station-input[data-id="${cssEscape(station.id)}"]`);
      if (input) {
        input.focus();
        input.select();
      }
    });
    showToast("已添加空白站点，可直接改名或用地图选站");
  }

  function reverseStations() {
    if (state.stations.length < 2) return;
    state.stations.reverse();
    renderAll();
    scheduleSave();
    showToast("已反转线路方向");
  }

  function clearStations() {
    if (!state.stations.length) return;
    if (!window.confirm("确定清空所有站点吗？清空后仍可通过地图重新添加。")) return;
    cancelFacilityScan();
    updateFacilityScanStatus("");
    state.stations = [];
    state.selectedStationId = null;
    renderAll();
    scheduleSave();
    showToast("站点已清空");
  }

  function resetDemo() {
    if (!window.confirm("恢复示例线路会覆盖当前编辑内容，确定继续吗？")) return;
    cancelFacilityScan();
    updateFacilityScanStatus("");
    clearAutoRouteOverlay({ silent: true, skipSync: true });
    const settings = { ...state.settings };
    state = defaultState();
    state.settings = settings;
    ensureSelectedStation();
    syncControls();
    renderAll();
    scheduleSave();
    clearNearby();
    showToast("已恢复 K6 示例线路");
  }

  function renderAll() {
    renderStationList();
    renderSign();
    updateMapFoot();
    syncMapRoute();
  }

  function bindStationDrag() {
    els.stationList.addEventListener("dragstart", (event) => {
      const row = event.target.closest(".station-row");
      if (!row) return;
      if (event.target.closest("input, button")) {
        event.preventDefault();
        return;
      }
      dragId = row.dataset.id;
      row.classList.add("is-dragging");
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dragId);
      } catch (error) {
        /* ignore */
      }
    });

    els.stationList.addEventListener("dragover", (event) => {
      if (!dragId) return;
      const row = event.target.closest(".station-row");
      if (!row || row.dataset.id === dragId) return;
      event.preventDefault();
      try {
        event.dataTransfer.dropEffect = "move";
      } catch (error) {
        /* ignore */
      }
      clearDropTarget();
      row.classList.add("is-drop-target");
    });

    els.stationList.addEventListener("dragleave", (event) => {
      const row = event.target.closest(".station-row");
      if (row) row.classList.remove("is-drop-target");
    });

    els.stationList.addEventListener("drop", (event) => {
      const row = event.target.closest(".station-row");
      if (!row || !dragId || row.dataset.id === dragId) return;
      event.preventDefault();
      const from = state.stations.findIndex((s) => s.id === dragId);
      const targetBefore = state.stations.findIndex((s) => s.id === row.dataset.id);
      if (from < 0 || targetBefore < 0) return;
      const [item] = state.stations.splice(from, 1);
      let insertAt = targetBefore;
      if (from < targetBefore) insertAt -= 1;
      state.stations.splice(insertAt, 0, item);
      dragId = null;
      clearDropTarget();
      renderAll();
      scheduleSave();
    });

    els.stationList.addEventListener("dragend", () => {
      dragId = null;
      clearDropTarget();
      els.stationList.querySelectorAll(".is-dragging").forEach((row) => row.classList.remove("is-dragging"));
    });
  }

  function clearDropTarget() {
    els.stationList.querySelectorAll(".is-drop-target").forEach((row) => row.classList.remove("is-drop-target"));
  }

  /* ---------------------------------------------------------------------- */
  /* AMap                                                                   */
  /* ---------------------------------------------------------------------- */

  async function connectMap(options = {}) {
    const key = String(state.settings.key || "").trim();
    if (!key) {
      if (!options.silent) openSettingsDialog();
      setMapStatus("未连接地图", "");
      setMapHintVisible(false);
      return;
    }

    if (window.AMap && currentMapKey && key !== currentMapKey) {
      showToast("地图 Key 已变化，正在重新加载…");
      window.setTimeout(() => window.location.reload(), 450);
      return;
    }

    els.mapLoading.hidden = false;
    els.mapEmpty.hidden = true;
    setMapStatus("正在加载地图", "");
    setMapHintVisible(false);

    try {
      if (!window.AMap) {
        if (String(state.settings.security || "").trim()) {
          window._AMapSecurityConfig = {
            securityJsCode: String(state.settings.security).trim()
          };
        }
        await loadScript(
          `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch,AMap.LineSearch`,
          "amap-jsapi"
        );
      }
      if (!window.AMap) throw new Error("高德地图脚本未初始化");
      currentMapKey = key;
      currentSecurityCode = String(state.settings.security || "").trim();
      initMap();
    } catch (error) {
      console.error(error);
      els.mapLoading.hidden = true;
      setMapStatus("地图加载失败", "error");
      showMapEmptyError("无法加载高德地图。请检查 JS API Key、安全密钥和域名白名单后重试。");
      if (!options.silent) showToast("高德地图加载失败，请检查 Key 配置", true);
    }
  }

  function initMap() {
    if (map) {
      mapReady = true;
      els.mapLoading.hidden = true;
      els.mapEmpty.hidden = true;
      setMapHintVisible(true);
      setMapStatus("已连接", "live");
      if (!restoreSavedAutoRoute()) syncMapRoute();
      window.setTimeout(maybeAutoDetectFacilities, 800);
      return;
    }

    try {
      map = new AMap.Map("amap", {
        zoom: 12,
        center: [119.296494, 26.074508],
        viewMode: "2D",
        mapStyle: "amap://styles/normal",
        showLabel: true
      });

      map.on("complete", onMapReady);
      map.on("click", onMapClick);

      if (window.AMap && typeof AMap.plugin === "function") {
        AMap.plugin(["AMap.PlaceSearch", "AMap.LineSearch"], () => {
          placeSearch = new AMap.PlaceSearch({
            type: "公交车站",
            city: state.settings.city || "福州",
            citylimit: true,
            pageSize: 20,
            extensions: "all"
          });
        });
      }

      window.clearTimeout(mapLoadingTimer);
      mapLoadingTimer = window.setTimeout(() => {
        if (!mapReady) {
          els.mapLoading.hidden = true;
          setMapStatus("地图加载超时", "error");
          showMapEmptyError("地图初始化超时。通常是 Key 未配置 JS API 权限、安全密钥不正确，或当前域名未加入白名单。");
        }
      }, 12000);
    } catch (error) {
      console.error(error);
      els.mapLoading.hidden = true;
      setMapStatus("地图初始化失败", "error");
      showMapEmptyError("地图初始化失败，请检查高德 Key 是否为「Web端（JS API）」类型。");
    }
  }

  function onMapReady() {
    mapReady = true;
    window.clearTimeout(mapLoadingTimer);
    els.mapLoading.hidden = true;
    els.mapEmpty.hidden = true;
    setMapHintVisible(true);
    setMapStatus("已连接", "live");
    if (map) map.setDefaultCursor(mapPanMode ? "grab" : "default");
    if (!restoreSavedAutoRoute()) {
      syncMapRoute();
      const coords = getRouteCoords();
      if (coords.length) {
        window.setTimeout(() => fitRoute(), 250);
      }
    }
    window.setTimeout(maybeAutoDetectFacilities, 800);
  }

  function onMapClick(event) {
    if (!mapReady || mapPanMode) return;
    const lng = Number(event.lnglat.getLng());
    const lat = Number(event.lnglat.getLat());
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    pendingCenter = [lng, lat];
    setPendingMarker([lng, lat]);
    drawDraftLine([lng, lat]);
    searchNearby([lng, lat]);
  }

  function setPendingMarker(center) {
    if (!map) return;
    if (pendingMarker) map.remove(pendingMarker);
    pendingMarker = new AMap.Marker({
      position: center,
      content: `<div class="map-pending-marker"></div>`,
      offset: new AMap.Pixel(-9, -9),
      zIndex: 220
    });
    map.add(pendingMarker);
  }

  function clearPending() {
    if (map && pendingMarker) map.remove(pendingMarker);
    pendingMarker = null;
    pendingCenter = null;
    if (map && draftLine) map.remove(draftLine);
    draftLine = null;
  }

  function drawDraftLine(center) {
    if (!map) return;
    if (draftLine) map.remove(draftLine);
    const coords = getRouteCoords();
    if (!coords.length) return;
    const last = coords[coords.length - 1];
    draftLine = new AMap.Polyline({
      path: [last, center],
      strokeColor: "#73877d",
      strokeWeight: 2,
      strokeStyle: "dashed",
      strokeDasharray: [6, 6],
      strokeOpacity: .85,
      zIndex: 70
    });
    map.add(draftLine);
  }

  function searchNearby(center, options = {}) {
    if (!placeSearch) {
      showNearbyMessage("地图搜索插件还在加载", "稍等片刻后再点一次地图即可。");
      return;
    }

    if (!options.keepCenter) pendingCenter = center;
    const radius = Number(state.settings.radius) || 500;
    els.nearbyCard.hidden = false;
    els.nearbySubtitle.textContent = `${radius} m 内`;
    els.nearbyList.innerHTML = `<div class="nearby-empty">正在识别附近公交站…</div>`;

    placeSearch.searchNearBy("", center, radius, (status, result) => {
      let pois = extractPois(result);
      if ((!pois.length) && status !== "error") {
        placeSearch.searchNearBy("公交站", center, radius, (secondStatus, secondResult) => {
          handleNearbyResult(secondStatus, extractPois(secondResult), radius);
        });
        return;
      }
      handleNearbyResult(status, pois, radius);
    });
  }

  function handleNearbyResult(status, pois, radius) {
    if (status === "error") {
      showNearbyMessage("附近站点搜索失败", "请检查高德 Key 是否开通了 Web 服务权限，或稍后重试。");
      clearCandidateMarkers();
      return;
    }

    lastNearbyPois = pois;
    renderCandidateMarkers(pois.slice(0, 8));

    if (!pois.length) {
      showNearbyMessage("附近没有识别到公交站", `半径 ${radius} m 内没有结果。试试扩大搜索半径，或点击公交站牌所在的位置。`);
      return;
    }

    renderNearbyList(pois);

    if (state.settings.autoAdd) {
      window.setTimeout(() => addStationFromPoi(pois[0], { auto: true }), 60);
    }
  }

  function extractPois(result) {
    if (!result || !result.poiList || !Array.isArray(result.poiList.pois)) return [];
    return result.poiList.pois
      .filter((poi) => poi && poi.location && poi.name)
      .map((poi) => ({
        ...poi,
        distance: Number(poi.distance) || 0
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }

  function renderNearbyList(pois) {
    els.nearbyList.innerHTML = pois.map((poi, index) => {
      const duplicate = isDuplicatePoi(poi);
      return `<button class="nearby-item" type="button" data-poi-index="${index}" ${duplicate ? "disabled" : ""}>
        <span class="nearby-pin"></span>
        <span class="nearby-name" title="${escapeHtml(poi.name || "")}">${escapeHtml(cleanPoiName(poi.name || "公交站"))}</span>
        <span class="nearby-distance">${duplicate ? "已添加" : formatDistance(poi.distance)}</span>
        <span class="nearby-add">${duplicate ? "✓" : "＋"}</span>
      </button>`;
    }).join("");
  }

  function showNearbyMessage(title, body) {
    els.nearbyCard.hidden = false;
    els.nearbyList.innerHTML = `<div class="nearby-empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(body)}</div>`;
  }

  function addStationFromPoi(poi, options = {}) {
    if (!poi || !poi.location) return;
    const lng = Number(poi.location.lng);
    const lat = Number(poi.location.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      showToast("这个公交站没有坐标，无法加入线路", true);
      return;
    }
    if (isDuplicatePoi(poi)) {
      showToast("该站点已在线路中");
      return;
    }

    const name = cleanPoiName(poi.name || "公交站");
    const station = {
      id: makeId(),
      name,
      icon: false,
      hospital: false,
      autoMetro: false,
      autoHospital: false,
      facilityScanned: false,
      metroDistance: null,
      hospitalDistance: null,
      lng,
      lat,
      address: poi.address || ""
    };
    state.stations.push(station);

    renderAll();
    scheduleSave();
    closeNearby();
    showToast(options.auto ? `已自动添加「${name}」` : `已添加「${name}」`);
    window.setTimeout(() => autoDetectFacilities({ stationIds: [station.id], silent: true }), 300);
  }

  function isDuplicatePoi(poi) {
    if (!poi || !poi.location) return false;
    const lng = Number(poi.location.lng);
    const lat = Number(poi.location.lat);
    return state.stations.some((station) => {
      if (station.lng == null || station.lat == null) return false;
      return distanceMeters(station.lng, station.lat, lng, lat) < 30;
    });
  }

  function renderCandidateMarkers(pois) {
    clearCandidateMarkers();
    if (!map) return;
    pois.forEach((poi) => {
      if (!poi.location) return;
      const marker = new AMap.Marker({
        position: [Number(poi.location.lng), Number(poi.location.lat)],
        content: `<div class="map-candidate-marker" title="${escapeHtml(poi.name || "")}"></div>`,
        offset: new AMap.Pixel(-7, -7),
        zIndex: 140
      });
      marker.on("click", () => addStationFromPoi(poi));
      candidateMarkers.push(marker);
      map.add(marker);
    });
  }

  function clearCandidateMarkers() {
    if (map) candidateMarkers.forEach((marker) => map.remove(marker));
    candidateMarkers = [];
  }

  function closeNearby() {
    clearCandidateMarkers();
    els.nearbyCard.hidden = true;
    els.nearbyList.innerHTML = "";
    lastNearbyPois = [];
    clearPending();
  }

  function openAutoRouteDialog() {
    const keyword = routeLookupKeyword(state.routeNumber);
    if (!keyword) {
      showToast("请先填写公交线路号", true);
      return;
    }
    if (!mapReady) {
      showToast("地图还在加载，请稍后再试", true);
      return;
    }
    if (!els.autoRouteDialog.open) els.autoRouteDialog.showModal();
    searchAutoRoute(keyword);
  }

  function closeAutoRouteDialog() {
    if (els.autoRouteDialog.open) els.autoRouteDialog.close();
  }

  async function searchAutoRoute(keyword) {
    if (autoRouteBusy) return;
    autoRouteBusy = true;
    autoRouteResults = [];
    const city = state.settings.city || "福州";
    els.autoRouteSubtitle.textContent = `正在搜索「${keyword}」 · ${city}`;
    els.autoRouteBody.innerHTML = `<div class="auto-route-loading"><span class="spinner"></span><span>正在查询高德公交线路…</span></div>`;

    try {
      const response = await new Promise((resolve, reject) => {
        AMap.plugin(["AMap.LineSearch"], () => {
          try {
            const searcher = new AMap.LineSearch({
              pageIndex: 1,
              pageSize: 20,
              city,
              extensions: "all"
            });
            searcher.search(keyword, (status, result) => {
              resolve({ status, result });
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      if (response.status !== "complete" || !response.result || !Array.isArray(response.result.lineInfo)) {
        renderAutoRouteEmpty("没有查到这条线路", "请检查线路号是否正确，或换一个城市后再试。");
        return;
      }

      const base = keyword.replace(/路$/i, "").toUpperCase();
      const all = response.result.lineInfo.filter((line) => line && line.name);
      let matches = all.filter((line) => {
        const name = String(line.name).replace(/\s+/g, "").toUpperCase();
        return name.startsWith(base);
      });
      if (!matches.length) matches = all;

      const seen = new Set();
      matches = matches.filter((line) => {
        const key = `${line.name}|${line.start_stop}|${line.end_stop}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);

      if (!matches.length) {
        renderAutoRouteEmpty("没有查到这条线路", "可以检查线路号，或确认当前城市是否为福州。");
        return;
      }

      autoRouteResults = matches;
      const exact = matches.some((line) => String(line.name || "").includes(keyword.replace(/路$/i, "")));
      els.autoRouteSubtitle.textContent = exact
        ? `找到 ${matches.length} 个方向 · ${city}`
        : `未精确匹配，显示 ${matches.length} 条可能相关线路 · ${city}`;
      renderAutoRouteResults(matches);
    } catch (error) {
      console.error("Bus line search failed", error);
      renderAutoRouteEmpty("线路查询失败", "请检查高德 Key 是否包含公交线路查询权限，或稍后再试。");
    } finally {
      autoRouteBusy = false;
    }
  }

  function renderAutoRouteEmpty(title, body) {
    els.autoRouteSubtitle.textContent = "未找到结果";
    els.autoRouteBody.innerHTML = `<div class="auto-route-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`;
  }

  function renderAutoRouteResults(lines) {
    els.autoRouteBody.innerHTML = lines.map((line, index) => {
      const stops = Array.isArray(line.via_stops) ? line.via_stops.length : 0;
      const { first, last } = extractLineTimes(line);
      const timeText = first || last ? `首班 ${first || "—"} · 末班 ${last || "—"}` : "首末班时间未返回";
      return `<div class="line-result">
        <div class="line-result-main">
          <strong>${escapeHtml(getLineTitle(line))}</strong>
          <small>${stops} 站 · ${timeText}</small>
          <small>${escapeHtml(line.start_stop || "")} → ${escapeHtml(line.end_stop || "")}</small>
        </div>
        <div class="line-result-actions">
          <button class="btn btn-small btn-ghost" type="button" data-line-action="draw" data-line-index="${index}">画线</button>
          <button class="btn btn-small btn-primary" type="button" data-line-action="load" data-line-index="${index}" ${stops ? "" : "disabled"}>载入站牌</button>
        </div>
      </div>`;
    }).join("");
  }

  function setFacilityScanBusy(busy) {
    if (!els.btnAutoFacilities) return;
    els.btnAutoFacilities.disabled = busy;
    els.btnAutoFacilities.textContent = busy ? "检测中…" : "自动检测";
  }

  function updateFacilityScanStatus(text, busy = false) {
    if (!els.facilityScanStatus) return;
    els.facilityScanStatus.hidden = !text;
    els.facilityScanStatus.textContent = text;
    els.facilityScanStatus.classList.toggle("is-busy", Boolean(busy));
  }

  function ensureFacilitySearchPlugin() {
    return new Promise((resolve) => {
      if (!window.AMap) {
        resolve(false);
        return;
      }
      if (typeof AMap.PlaceSearch === "function") {
        resolve(true);
        return;
      }
      AMap.plugin(["AMap.PlaceSearch"], () => resolve(typeof AMap.PlaceSearch === "function"));
    });
  }

  function rateLimitFacilitySearch() {
    const run = facilitySearchGate.then(async () => {
      const wait = Math.max(0, lastFacilitySearchAt + FACILITY_SEARCH_INTERVAL - Date.now());
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      lastFacilitySearchAt = Date.now();
    });
    facilitySearchGate = run.catch(() => {});
    return run;
  }

  async function searchNearbyFacilities(center) {
    // One request returns both categories; combined with the 520ms gate this
    // keeps the nearby-search QPS at <= 2 and avoids AMap throttling.
    await rateLimitFacilitySearch();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(() => finish({ metro: null, hospital: null, error: true }), 12000);

      try {
        const searcher = new AMap.PlaceSearch({
          type: FACILITY_SEARCH_TYPE,
          city: state.settings.city || "福州",
          citylimit: true,
          pageSize: FACILITY_PAGE_SIZE,
          extensions: "base"
        });
        searcher.searchNearBy("", center, FACILITY_SEARCH_RADIUS, (status, result) => {
          if (status === "no_data") {
            finish({ metro: null, hospital: null, error: false });
            return;
          }
          if (status !== "complete" || !result || !result.poiList) {
            finish({ metro: null, hospital: null, error: true });
            return;
          }

          let metro = null;
          let hospital = null;
          (result.poiList.pois || []).forEach((poi) => {
            if (!poi || !poi.location) return;
            const point = [Number(poi.location.lng), Number(poi.location.lat)];
            if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
            const type = String(poi.type || "");
            const distance = Number.isFinite(Number(poi.distance))
              ? Number(poi.distance)
              : distanceMeters(center[0], center[1], point[0], point[1]);
            const item = { name: String(poi.name || "未命名"), distance };
            if (type.includes("地铁站")) {
              if (!metro || distance < metro.distance) metro = item;
            } else if (type.includes("医疗") || type.includes("医院")) {
              if (!hospital || distance < hospital.distance) hospital = item;
            }
          });
          finish({ metro, hospital, error: false });
        });
      } catch (error) {
        console.warn("Facility search failed", error);
        finish({ metro: null, hospital: null, error: true });
      }
    });
  }

  async function searchNearbyFacilitiesWithRetry(center) {
    let last = { metro: null, hospital: null, error: true };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      last = await searchNearbyFacilities(center);
      if (!last.error) return last;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
    return last;
  }

  function cancelFacilityScan() {
    facilityScanToken += 1;
    facilityScanBusy = false;
    setFacilityScanBusy(false);
  }

  async function autoDetectFacilities(options = {}) {
    if (facilityScanBusy) return;
    if (!window.AMap) {
      showToast("请先连接高德地图，再自动检测设施", true);
      return;
    }

    const requestedIds = Array.isArray(options.stationIds) && options.stationIds.length
      ? new Set(options.stationIds)
      : null;
    const targetStations = requestedIds
      ? state.stations.filter((station) => requestedIds.has(station.id))
      : state.stations.slice();

    if (!targetStations.length) {
      showToast("还没有可检测的站点", true);
      return;
    }

    const located = targetStations.filter((station) =>
      Number.isFinite(Number(station.lng)) && Number.isFinite(Number(station.lat))
      && station.lng !== null && station.lat !== null
    );

    if (!located.length) {
      updateFacilityScanStatus("这些站点还没有坐标，请先用地图选站或自动查线补全位置。");
      showToast("站点还没有坐标，无法计算距离", true);
      return;
    }

    const pluginReady = await ensureFacilitySearchPlugin();
    if (!pluginReady) {
      showToast("高德地点搜索没有加载成功，请重新连接地图", true);
      return;
    }

    const token = ++facilityScanToken;
    facilityScanBusy = true;
    setFacilityScanBusy(true);

    if (!requestedIds) {
      targetStations.forEach((station) => {
        if (!Number.isFinite(Number(station.lng)) || !Number.isFinite(Number(station.lat))
          || station.lng === null || station.lat === null) {
          station.autoMetro = false;
          station.autoHospital = false;
          station.facilityScanned = false;
          station.facilityVersion = 0;
          station.metroDistance = null;
          station.hospitalDistance = null;
        }
      });
    }

    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    updateFacilityScanStatus(`正在检测 0/${located.length} 个站点…`, true);

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= located.length) return;
        const station = located[index];
        try {
          const center = [Number(station.lng), Number(station.lat)];
          const result = await searchNearbyFacilitiesWithRetry(center);
          if (token !== facilityScanToken) return;
          const metro = result.metro;
          const hospital = result.hospital;
          station.metroDistance = metro ? Math.round(metro.distance) : null;
          station.hospitalDistance = hospital ? Math.round(hospital.distance) : null;
          station.autoMetro = Boolean(metro && metro.distance < FACILITY_THRESHOLD);
          station.autoHospital = Boolean(hospital && hospital.distance < FACILITY_THRESHOLD);
          const scanSucceeded = !result.error;
          station.facilityScanned = scanSucceeded;
          station.facilityVersion = scanSucceeded ? FACILITY_SCAN_VERSION : 0;
          if (scanSucceeded) {
            cacheDetailFacility(`${Number(station.lng).toFixed(5)},${Number(station.lat).toFixed(5)}`, {
              autoMetro: station.autoMetro,
              autoHospital: station.autoHospital,
              metroDistance: station.metroDistance,
              hospitalDistance: station.hospitalDistance
            });
          } else {
            failed += 1;
          }
        } catch (error) {
          failed += 1;
          station.facilityScanned = false;
          station.facilityVersion = 0;
          console.warn("Facility detection failed for station", station.name, error);
        }
        completed += 1;
        updateFacilityScanStatus(`正在检测 ${completed}/${located.length} 个站点…`, true);
      }
    };

    try {
      const workerCount = Math.min(1, located.length);
      await Promise.all(Array.from({ length: workerCount }, worker));
    } finally {
      if (token === facilityScanToken) {
        facilityScanBusy = false;
        setFacilityScanBusy(false);
      }
    }

    if (token !== facilityScanToken) return;

    const metroCount = located.filter((station) => station.autoMetro).length;
    const hospitalCount = located.filter((station) => station.autoHospital).length;
    const scannedCount = Math.max(0, located.length - failed);
    updateFacilityScanStatus(
      `已检测 ${scannedCount} 站：${metroCount} 站 200m 内有地铁，${hospitalCount} 站 200m 内有医院。`
      + (failed ? `（${failed} 站查询失败，可再点「自动检测」重试）` : "")
    );
    renderStationList();
    renderSign();
    scheduleSave();

    if (!options.silent) {
      showToast(`检测完成：地铁 ${metroCount} 站 · 医院 ${hospitalCount} 站`);
    }
  }

  function maybeAutoDetectFacilities() {
    if (facilityScanBusy || !window.AMap) return;
    const needsScan = state.stations.some((station) =>
      station.lng !== null && station.lat !== null
      && Number.isFinite(Number(station.lng)) && Number.isFinite(Number(station.lat))
      && (!station.facilityScanned || Number(station.facilityVersion || 0) < FACILITY_SCAN_VERSION)
    );
    if (needsScan) autoDetectFacilities({ silent: true });
  }

  function onAutoRouteBodyClick(event) {
    const button = event.target.closest("button[data-line-action]");
    if (!button) return;
    const index = Number(button.dataset.lineIndex);
    const line = autoRouteResults[index];
    if (!line) return;
    const replaceStations = button.dataset.lineAction === "load";
    closeAutoRouteDialog();
    drawAutoRoute(line, { replaceStations });
  }

  async function switchRouteDirection() {
    if (directionSwitchBusy) return;
    if (state.stations.length < 2) {
      showToast("至少要有两个站点才能换向", true);
      return;
    }

    const oppositeId = autoRouteMeta && autoRouteMeta.oppositeId;
    if (!oppositeId || !window.AMap) {
      reverseStations();
      showToast("已反转当前站点顺序");
      return;
    }

    directionSwitchBusy = true;
    if (els.btnSwapDirection) {
      els.btnSwapDirection.disabled = true;
      els.btnSwapDirection.textContent = "换向中…";
    }

    try {
      const line = await new Promise((resolve) => {
        AMap.plugin(["AMap.LineSearch"], () => {
          if (typeof AMap.LineSearch !== "function") {
            resolve(null);
            return;
          }
          const searcher = new AMap.LineSearch({
            pageIndex: 1,
            pageSize: 1,
            city: state.settings.city || "福州",
            extensions: "all"
          });
          if (typeof searcher.searchById !== "function") {
            resolve(null);
            return;
          }
          searcher.searchById(oppositeId, (status, result) => {
            resolve(status === "complete" && result && result.lineInfo
              ? (result.lineInfo[0] || null)
              : null);
          });
        });
      });

      if (line) {
        drawAutoRoute(line, { replaceStations: true });
      } else {
        reverseStations();
        showToast("没找到对向线路，已反转当前站点");
      }
    } catch (error) {
      console.warn("Direction switch failed", error);
      reverseStations();
      showToast("换向失败，已反转当前站点", true);
    } finally {
      directionSwitchBusy = false;
      if (els.btnSwapDirection) {
        els.btnSwapDirection.disabled = false;
        els.btnSwapDirection.textContent = "换向";
      }
    }
  }

  function drawAutoRoute(line, options = {}) {
    if (!map || !mapReady) {
      showToast("地图还没准备好", true);
      return;
    }
    const path = (Array.isArray(line.path) ? line.path : [])
      .map((point) => [Number(point.lng), Number(point.lat)])
      .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (path.length < 2) {
      showToast("这条线路没有返回可绘制的路径", true);
      return;
    }

    const stops = (Array.isArray(line.via_stops) ? line.via_stops : [])
      .filter((stop) => stop && stop.location)
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
      .map((stop) => {
        const lng = Number(stop.location.lng);
        const lat = Number(stop.location.lat);
        const snapped = Number.isFinite(lng) && Number.isFinite(lat)
          ? snapPointToPath(lng, lat, path)
          : [lng, lat];
        return {
          name: String(stop.name || "公交站"),
          lng: snapped[0],
          lat: snapped[1]
        };
      })
      .filter((stop) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat));

    clearAutoRouteOverlay({ silent: true, skipSync: true });

    const lineTitle = getLineTitle(line);
    const direction = `${line.start_stop || ""} → ${line.end_stop || ""}`;
    autoRouteMeta = {
      name: lineTitle,
      label: `${lineTitle} · ${direction}`,
      start: line.start_stop || "",
      end: line.end_stop || "",
      lineId: line.id || "",
      oppositeId: line.direc || "",
      path,
      stops,
      mode: options.replaceStations ? "stations" : "route",
      suppressConnector: true
    };

    state.autoRoute = {
      name: autoRouteMeta.name,
      label: autoRouteMeta.label,
      start: autoRouteMeta.start,
      end: autoRouteMeta.end,
      lineId: autoRouteMeta.lineId,
      oppositeId: autoRouteMeta.oppositeId,
      path,
      stops,
      mode: autoRouteMeta.mode,
      suppressConnector: true
    };

    autoRouteLine = new AMap.Polyline({
      path,
      strokeColor: state.express ? EXPRESS_META.color : COMPANY_META[state.company].color,
      strokeWeight: 5,
      strokeOpacity: .84,
      lineJoin: "round",
      lineCap: "round",
      showDir: true,
      zIndex: 85
    });
    map.add(autoRouteLine);

    if (options.replaceStations && stops.length) {
      cancelFacilityScan();
      state.selectedStationId = null;
      state.stations = stops.map((stop) => ({
        id: makeId(),
        name: stop.name,
        icon: false,
        hospital: false,
        autoMetro: false,
        autoHospital: false,
        facilityScanned: false,
        metroDistance: null,
        hospitalDistance: null,
        lng: stop.lng,
        lat: stop.lat,
        address: ""
      }));
      state.nextStop = "";
      state.destStop = "";
      ensureSelectedStation();
      const { first, last } = extractLineTimes(line);
      if (first) state.firstTime = first;
      if (last) state.lastTime = last;
      const fare = formatFareFromLine(line);
      if (fare) state.fare = fare;
      const loadedRoute = stationLineInfo(line).route;
      if (loadedRoute) state.routeNumber = loadedRoute;
      applyAutoExpress();
      syncControls();
      renderAll();
      showToast(first || last
        ? `已载入 ${stops.length} 站 · 首末班 ${first || "—"} / ${last || "—"}`
        : `已载入 ${stops.length} 站（高德未返回首末班）`);
      if (!options.skipFacilityScan) {
        window.setTimeout(() => autoDetectFacilities({ silent: true }), 700);
      }
    } else {
      autoRouteMeta.suppressConnector = true;
      autoRouteStopMarkers = stops.map((stop) => {
        const marker = new AMap.Marker({
          position: [stop.lng, stop.lat],
          content: `<div class="bus-route-stop" title="${escapeHtml(stop.name)}"></div>`,
          offset: new AMap.Pixel(-5, -5),
          zIndex: 90
        });
        marker.on("click", () => {
          if (!mapPanMode) showToast(stop.name);
        });
        map.add(marker);
        return marker;
      });
      syncMapRoute();
      showToast(`已在地图上显示 ${autoRouteMeta.label}`);
    }

    autoRouteMeta.suppressConnector = true;
    updateAutoRouteStatus();
    scheduleSave();
    window.setTimeout(fitAutoRoute, 80);
  }

  function restoreSavedAutoRoute() {
    if (!window.AMap || !map || !mapReady || !state.autoRoute) return false;
    const saved = normalizeAutoRoute(state.autoRoute);
    if (!saved) {
      state.autoRoute = null;
      return false;
    }
    if (autoRouteLine) map.remove(autoRouteLine);
    autoRouteLine = null;
    autoRouteStopMarkers.forEach((marker) => map.remove(marker));
    autoRouteStopMarkers = [];
    state.autoRoute = saved;
    autoRouteMeta = { ...saved, suppressConnector: true };
    autoRouteLine = new AMap.Polyline({
      path: saved.path,
      strokeColor: state.express ? EXPRESS_META.color : COMPANY_META[state.company].color,
      strokeWeight: 5,
      strokeOpacity: .84,
      lineJoin: "round",
      lineCap: "round",
      showDir: true,
      zIndex: 85
    });
    map.add(autoRouteLine);

    if (saved.mode === "route") {
      autoRouteStopMarkers = saved.stops.map((stop) => {
        const marker = new AMap.Marker({
          position: [stop.lng, stop.lat],
          content: `<div class="bus-route-stop" title="${escapeHtml(stop.name)}"></div>`,
          offset: new AMap.Pixel(-5, -5),
          zIndex: 90
        });
        marker.on("click", () => {
          if (!mapPanMode) showToast(stop.name);
        });
        map.add(marker);
        return marker;
      });
    }

    syncMapRoute();
    updateAutoRouteStatus();
    window.setTimeout(fitAutoRoute, 100);
    return true;
  }

  function clearAutoRouteOverlay(options = {}) {
    if (map && autoRouteLine) map.remove(autoRouteLine);
    autoRouteLine = null;
    if (map) autoRouteStopMarkers.forEach((marker) => map.remove(marker));
    autoRouteStopMarkers = [];
    const hadRoute = Boolean(autoRouteMeta);
    autoRouteMeta = null;
    state.autoRoute = null;
    updateAutoRouteStatus();
    if (!options.skipSync && map && mapReady) syncMapRoute();
    if (!options.skipSave) scheduleSave();
    if (!options.silent && hadRoute) showToast("已清除自动线路");
  }

  function updateAutoRouteStatus() {
    if (!els.autoRouteStatus || !els.btnClearAutoRoute) return;
    const active = Boolean(autoRouteMeta);
    els.autoRouteStatus.hidden = !active;
    els.btnClearAutoRoute.hidden = !active;
    if (active) {
      els.autoRouteStatus.textContent = `已显示：${autoRouteMeta.label}`;
      els.autoRouteStatus.title = autoRouteMeta.label;
    } else {
      els.autoRouteStatus.textContent = "";
    }
  }

  function fitAutoRoute() {
    if (!map || !mapReady) return;
    const overlays = [];
    if (autoRouteLine) overlays.push(autoRouteLine);
    overlays.push(...stationMarkers, ...autoRouteStopMarkers);
    if (!overlays.length) return;
    map.setFitView(overlays, false, [70, 70, 70, 70], 15);
  }

  function setMapPanMode(active) {
    mapPanMode = Boolean(active);
    if (els.btnMapPan) {
      els.btnMapPan.classList.toggle("is-active", mapPanMode);
      els.btnMapPan.setAttribute("aria-pressed", mapPanMode ? "true" : "false");
      const label = mapPanMode ? "切换到选站模式" : "拖动地图（不会选站）";
      els.btnMapPan.title = label;
      els.btnMapPan.setAttribute("aria-label", label);
    }
    if (els.mapHintText) {
      els.mapHintText.textContent = mapPanMode
        ? "拖动模式：按住拖动地图，不会触发选站"
        : "点击地图任意位置 → 自动搜索附近公交站";
    }
    if (map) {
      try {
        map.setDefaultCursor(mapPanMode ? "grab" : "default");
      } catch (error) {
        // Older AMap builds may not expose setDefaultCursor.
      }
    }
    if (mapPanMode) {
      closeNearby();
      showToast("已进入拖动模式，地图拖动不会选站");
    }
  }

  async function toggleMapFullscreen() {
    const target = els.mapCard;
    if (!target) return;
    const active = document.fullscreenElement === target || document.webkitFullscreenElement === target;
    try {
      if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      } else {
        showToast("当前浏览器不支持全屏预览", true);
      }
    } catch (error) {
      console.warn("Fullscreen failed", error);
      showToast("浏览器没有允许全屏，请再点一次试试", true);
    }
  }

  function onFullscreenChange() {
    const active = document.fullscreenElement === els.mapCard || document.webkitFullscreenElement === els.mapCard;
    if (!els.btnMapFullscreen) return;
    els.btnMapFullscreen.classList.toggle("is-active", active);
    els.btnMapFullscreen.setAttribute("aria-pressed", active ? "true" : "false");
    els.btnMapFullscreen.innerHTML = active ? ICON.collapse : ICON.expand;
    const label = active ? "退出全屏" : "全屏查看地图";
    els.btnMapFullscreen.title = label;
    els.btnMapFullscreen.setAttribute("aria-label", label);
    if (map) {
      window.setTimeout(() => map.resize(), 120);
    }
  }

  function snapPointToPath(lng, lat, path) {
    if (!Array.isArray(path) || path.length < 2) return [lng, lat];
    const lonScale = Math.cos(lat * Math.PI / 180) * 111320;
    const latScale = 110540;
    let best = null;
    let bestDistance = Infinity;

    for (let i = 0; i < path.length - 1; i += 1) {
      const ax = (path[i][0] - lng) * lonScale;
      const ay = (path[i][1] - lat) * latScale;
      const bx = (path[i + 1][0] - lng) * lonScale;
      const by = (path[i + 1][1] - lat) * latScale;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const distance = px * px + py * py;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [lng + px / lonScale, lat + py / latScale];
      }
    }

    // Keep a stop in place if the returned path is unusually far away.
    if (best && Math.sqrt(bestDistance) <= 120) return best;
    return [lng, lat];
  }

  function extractLineTimes(line) {
    let first = formatLineTime(line && line.stime);
    let last = formatLineTime(line && line.etime);

    if ((!first || !last) && line && line.timedesc) {
      let text = String(line.timedesc);
      try {
        text = decodeURIComponent(text);
      } catch (error) {
        // Keep the raw string if it was not percent-encoded.
      }
      const starts = [...text.matchAll(/start_time[^0-9]*(\d{2}:\d{2})/g)]
        .map((match) => match[1])
        .sort();
      const ends = [...text.matchAll(/end_time[^0-9]*(\d{2}:\d{2})/g)]
        .map((match) => match[1])
        .sort();
      if (!first && starts.length) first = starts[0];
      if (!last && ends.length) last = ends[ends.length - 1];
    }

    if (!first) first = formatLineTime(line && (line.start_time || line.first_time));
    if (!last) last = formatLineTime(line && (line.end_time || line.last_time));
    return { first, last };
  }

  function getLineTitle(line) {
    return String(line && line.name ? line.name : "未命名线路")
      .replace(/[（(][^()（）]*[)）]\s*$/, "")
      .trim() || "未命名线路";
  }

  function formatLineTime(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    let digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    if (digits.length === 3) digits = `0${digits}`;
    if (digits.length >= 4) {
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    }
    return "";
  }

  function formatRemainingTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (value < 1) return "不到 1 秒";
    if (value < 60) return `约 ${Math.ceil(value)} 秒`;
    const minutes = Math.floor(value / 60);
    const rest = Math.ceil(value % 60);
    return rest ? `约 ${minutes} 分 ${rest} 秒` : `约 ${minutes} 分钟`;
  }

  function chineseFareNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "";
    if (!Number.isInteger(number)) return String(number);
    const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    if (number < 10) return digits[number];
    if (number === 10) return "十";
    if (number < 20) return `十${digits[number - 10]}`;
    if (number < 100) {
      return `${digits[Math.floor(number / 10)]}十${number % 10 ? digits[number % 10] : ""}`;
    }
    return String(number);
  }

  function formatFareFromLine(line) {
    if (!line) return "";
    const basic = Number(line.basic_price);
    const total = Number(line.total_price);
    const price = total > 0 ? total : basic;
    if (!Number.isFinite(price) || price <= 0) return "";
    if (basic > 0 && total > 0 && basic !== total) {
      return `分段计价（${chineseFareNumber(price)}元）`;
    }
    return `一票制${chineseFareNumber(price)}元`;
  }

  function getRouteCoords() {
    return state.stations
      .filter((station) => station.lng != null && station.lat != null)
      .map((station) => [Number(station.lng), Number(station.lat)]);
  }

  function syncMapRoute() {
    if (!map || !mapReady) {
      updateMapFoot();
      return;
    }

    stationMarkers.forEach((marker) => map.remove(marker));
    stationMarkers = [];
    if (routePolyline) {
      map.remove(routePolyline);
      routePolyline = null;
    }

    const color = state.express ? EXPRESS_META.color : COMPANY_META[state.company].color;
    if (autoRouteLine && typeof autoRouteLine.setOptions === "function") {
      autoRouteLine.setOptions({ strokeColor: color });
    }

    const coordStations = state.stations
      .map((station, index) => ({ ...station, index }))
      .filter((station) => station.lng != null && station.lat != null);

    if (coordStations.length >= 2 && !autoRouteMeta) {
      routePolyline = new AMap.Polyline({
        path: coordStations.map((station) => [Number(station.lng), Number(station.lat)]),
        strokeColor: color,
        strokeWeight: 4,
        strokeOpacity: .86,
        lineJoin: "round",
        lineCap: "round",
        showDir: true,
        zIndex: 80
      });
      map.add(routePolyline);
    }

    if (!(autoRouteMeta && autoRouteMeta.mode === "route")) {
      coordStations.forEach((station) => {
        const selected = station.id === (state.selectedStationId || state.stations[0]?.id);
        const marker = new AMap.Marker({
          position: [Number(station.lng), Number(station.lat)],
          content: `<div class="map-station-marker${selected ? " is-selected" : ""}">
            <span class="map-station-dot">${station.index + 1}</span>
            <span class="map-station-label">${escapeHtml(station.name || "未命名")}</span>
          </div>`,
          offset: new AMap.Pixel(-11, -11),
          zIndex: selected ? 130 : 120
        });
        marker.on("click", () => {
          if (mapPanMode) return;
          selectStation(station.id);
          map.setZoomAndCenter(Math.max(map.getZoom(), 15), [Number(station.lng), Number(station.lat)]);
        });
        stationMarkers.push(marker);
        map.add(marker);
      });
    }

    updateMapFoot();
  }

  function updateMapFoot() {
    const coordCount = state.stations.filter((s) => s.lng != null && s.lat != null).length;
    if (els.mapCount) {
      els.mapCount.textContent = `${coordCount} / ${state.stations.length} 个站点有坐标`;
    }
    if (els.btnFitRoute) {
      els.btnFitRoute.disabled = coordCount === 0;
    }
  }

  function fitRoute() {
    if (!map || !mapReady) return;
    const overlays = [...stationMarkers];
    if (routePolyline) overlays.push(routePolyline);
    if (!overlays.length) return;
    map.setFitView(overlays, false, [70, 70, 70, 70], 16);
  }

  function setMapHintVisible(visible) {
    if (els.mapHint) els.mapHint.hidden = !visible;
  }

  function setMapStatus(text, type) {
    if (!els.mapStatus) return;
    els.mapStatus.className = `map-status${type ? ` is-${type}` : ""}`;
    els.mapStatus.innerHTML = `<i></i><span>${escapeHtml(text)}</span>`;
  }

  function showMapEmptyError(message) {
    els.mapEmpty.hidden = false;
    setMapHintVisible(false);
    const title = els.mapEmpty.querySelector("h3");
    const copy = els.mapEmpty.querySelector("p");
    const small = els.mapEmpty.querySelector("small");
    if (title) title.textContent = "地图暂时没连上";
    if (copy) copy.textContent = message;
    if (small) small.textContent = "配置好后可直接重新连接，不会丢失当前编辑内容。";
  }

  function openSettingsDialog() {
    els.amapKeyInput.value = state.settings.key || "";
    els.amapSecurityInput.value = state.settings.security || "";
    els.amapCityInput.value = state.settings.city || "福州";
    if (!els.mapSettingsDialog.open) els.mapSettingsDialog.showModal();
    window.setTimeout(() => els.amapKeyInput.focus(), 50);
  }

  function closeSettingsDialog() {
    if (els.mapSettingsDialog.open) els.mapSettingsDialog.close();
  }

  function onSaveSettings(event) {
    event.preventDefault();
    const key = els.amapKeyInput.value.trim();
    const security = els.amapSecurityInput.value.trim();
    const city = els.amapCityInput.value.trim() || "福州";
    if (!key) {
      showToast("请先填写高德 JS API Key", true);
      els.amapKeyInput.focus();
      return;
    }

    const needsReload = Boolean(window.AMap && currentMapKey && (key !== currentMapKey || security !== currentSecurityCode));
    state.settings.key = key;
    state.settings.security = security;
    state.settings.city = city;
    scheduleSave();
    closeSettingsDialog();

    if (placeSearch && typeof placeSearch.setCity === "function") {
      placeSearch.setCity(city);
    }

    if (needsReload) {
      showToast("地图密钥已更新，正在重新加载…");
      window.setTimeout(() => window.location.reload(), 450);
      return;
    }

    connectMap();
  }

  /* ---------------------------------------------------------------------- */
  /* Export                                                                 */
  /* ---------------------------------------------------------------------- */

  async function exportPng(scale = 2) {
    if (exportBusy) return;
    exportBusy = true;
    setExportBusy(true);
    try {
      await document.fonts.ready;
      await preloadRenderAssets();
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(1280 * scale);
      canvas.height = Math.round(318 * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.scale(scale, scale);
      drawSignOnCanvas(ctx);

      const pngBlob = await canvasToBlob(canvas);
      downloadBlob(pngBlob, buildExportName(scale));
      showToast(`已导出 ${scale}× PNG（${canvas.width} × ${canvas.height}）`);
    } catch (error) {
      console.error("PNG export failed", error);
      showToast("导出失败，请刷新页面后重试", true);
    } finally {
      exportBusy = false;
      setExportBusy(false);
    }
  }

  async function preloadRenderAssets() {
    const tasks = [];

    if (!renderAssets.fuzhou) {
      tasks.push(loadImage("assets/logo-fuzhou.png").then((image) => {
        renderAssets.fuzhou = image;
      }).catch((error) => console.warn("Fuzhou logo load failed", error)));
    }
    if (!renderAssets.kangchi) {
      tasks.push(loadImage("assets/logo-kangchi.png").then((image) => {
        renderAssets.kangchi = image;
      }).catch((error) => console.warn("Kangchi logo load failed", error)));
    }
    if (!renderAssets.minyun) {
      tasks.push(loadImage("assets/logo-minyun.png").then((image) => {
        renderAssets.minyun = image;
      }).catch((error) => console.warn("Minyun logo load failed", error)));
    }
    if (!renderAssets.metroIcon) {
      tasks.push(loadImage("assets/icon-metro.png").then((image) => {
        renderAssets.metroIcon = image;
      }).catch((error) => console.warn("Metro icon load failed", error)));
    }
    if (!renderAssets.hospitalIcon) {
      tasks.push(loadImage("assets/icon-hospital.png").then((image) => {
        renderAssets.hospitalIcon = image;
      }).catch((error) => console.warn("Hospital icon load failed", error)));
    }

    await Promise.all(tasks);
  }

  function drawSignOnCanvas(ctx) {
    const express = state.express;
    const company = COMPANY_META[state.company] || COMPANY_META.fuzhou;
    const barColor = express ? EXPRESS_META.color : company.color;

    ctx.clearRect(0, 0, 1280, 318);
    ctx.fillStyle = express ? EXPRESS_META.color : "#141414";
    ctx.fillRect(0, 0, 1280, 318);
    ctx.fillStyle = express ? EXPRESS_META.color : "#ffffff";
    ctx.fillRect(2, 2, 1276, 314);

    ctx.save();
    ctx.translate(2, 2);

    if (express) {
      ctx.fillStyle = EXPRESS_META.color;
      ctx.fillRect(0, 0, 1276, 314);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1276, 314);
    }

    drawCanvasRouteNumber(ctx, express);
    if (express) {
      drawCanvasExpressWord(ctx);
    } else {
      drawCanvasHeadline(ctx);
    }
    drawCanvasTopLogo(ctx, express);
    drawCanvasTimes(ctx, express);

    const stationTop = express ? 118 : 146;
    const stationHeight = express ? 140 : 88;
    if (express) {
      ctx.fillStyle = "#ffee0b";
      ctx.beginPath();
      ctx.moveTo(0, 110);
      ctx.lineTo(1150, 110);
      ctx.lineTo(1200, 102);
      ctx.lineTo(1276, 116);
      ctx.lineTo(0, 116);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, stationTop, 1276, stationHeight);
    drawCanvasStations(ctx, stationTop, stationHeight, express);

    if (express) {
      drawCanvasExpressBottom(ctx, barColor);
    } else {
      drawCanvasRegularBottom(ctx, barColor);
    }

    ctx.restore();
  }

  function drawCanvasRouteNumber(ctx, express) {
    const text = String(state.routeNumber || "").trim() || "—";
    const size = getRouteFontSize(text);
    const color = express ? EXPRESS_NUMBER_COLOR : REGULAR_NUMBER_COLOR;

    ctx.save();
    ctx.translate(74, 0);
    ctx.font = `700 ${size}px "Arial", "Helvetica Neue", ${CANVAS_CHINESE_FONT}`;
    const naturalWidth = ctx.measureText(text).width;
    const scaleX = naturalWidth > 0 ? Math.min(1.02, 198 / naturalWidth) : 1.02;
    ctx.scale(scaleX, 1);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "-2px";
    // Keep every route label on the same optical centerline, regardless of
    // how many characters it has; otherwise long labels ride up near the top.
    const centerY = express ? 58 : 66;
    ctx.fillText(text, 0, centerY + size * 0.36);
    ctx.restore();
  }

  function drawCanvasHeadline(ctx) {
    const next = resolveNextStop();
    const dest = resolveDestination();
    const fare = String(state.fare || "").trim() || "一票制一元";
    const parts = [`下站${next}`, `开往${dest}`, fare];
    const routeLength = Array.from(String(state.routeNumber || "").trim()).length;
    const left = routeLength >= 3 ? 286 : 238;
    const maxWidth = 864 - left;

    let size = 22.5;
    let widths = [];
    let total = 0;
    while (size >= 13) {
      ctx.font = `500 ${size}px ${CANVAS_CHINESE_FONT}`;
      widths = parts.map((part) => ctx.measureText(part).width);
      total = widths.reduce((sum, width) => sum + width, 0) + 28 * (parts.length - 1);
      if (total <= maxWidth) break;
      size -= 0.5;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 62, maxWidth, 46);
    ctx.clip();
    ctx.fillStyle = "#171717";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let x = left;
    parts.forEach((part, index) => {
      ctx.fillText(part, x, 94);
      x += widths[index] + 28;
    });
    ctx.restore();
  }

  function drawCanvasExpressWord(ctx) {
    ctx.save();
    ctx.fillStyle = EXPRESS_NUMBER_COLOR;
    ctx.font = `600 31px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("快", 489, 102);
    ctx.fillText("线", 660, 102);
    ctx.restore();
  }

  function drawCanvasTopLogo(ctx, express) {
    drawCanvasCompanyLogo(ctx, state.company, 873, 27, 148, 76, express, true);
  }

  function drawCanvasCompanyLogo(ctx, company, x, y, width, height, light, alignRight) {
    const image = company === "fuzhou"
      ? renderAssets.fuzhou
      : company === "kangchi"
        ? renderAssets.kangchi
        : renderAssets.minyun;

    if (image) {
      const imageWidth = image.naturalWidth || image.width || width;
      const imageHeight = image.naturalHeight || image.height || height;
      const ratio = imageWidth / imageHeight;
      let drawWidth = width;
      let drawHeight = width / ratio;
      if (drawHeight > height) {
        drawHeight = height;
        drawWidth = height * ratio;
      }
      const drawX = alignRight ? x + width - drawWidth : x + (width - drawWidth) / 2;
      const drawY = y + (height - drawHeight) / 2;
      ctx.save();
      if (light) ctx.filter = "brightness(0) invert(1)";
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
      return;
    }

    const label = (COMPANY_META[company] || COMPANY_META.fuzhou).label;
    ctx.save();
    ctx.fillStyle = light ? "#ffffff" : (COMPANY_META[company] || COMPANY_META.fuzhou).color;
    ctx.font = `600 20px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = alignRight ? "right" : "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, alignRight ? x + width : x + width / 2, y + height / 2);
    ctx.restore();
  }

  function drawCanvasTimes(ctx, express) {
    const x = 1068;
    const y = 27;
    const width = 190;
    const height = 76;
    const timeCenter = x + 132;
    const ink = express ? "#ffffff" : "#202020";
    const border = express ? "rgba(255,255,255,.72)" : "#e2000b";

    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x + width, y + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + height - 1);
    ctx.lineTo(x + width, y + height - 1);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = `500 14.5px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const titleChars = ["营", "运", "时", "间"];
    titleChars.forEach((char, index) => {
      ctx.fillText(char, x + 14.5, y + 12 + index * 16.5);
    });

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `500 16.5px ${CANVAS_CHINESE_FONT}`;
    ctx.fillText("首班", x + 40, y + 29);
    ctx.fillText("末班", x + 40, y + 59);

    ctx.textAlign = "center";
    ctx.font = `700 23.5px Arial, "Helvetica Neue", ${CANVAS_CHINESE_FONT}`;
    ctx.save();
    ctx.translate(timeCenter, y + 29);
    ctx.scale(1.08, 1);
    ctx.fillText(state.firstTime || "--:--", 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(timeCenter, y + 59);
    ctx.scale(1.08, 1);
    ctx.fillText(state.lastTime || "--:--", 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawCanvasStations(ctx, stationTop, stationHeight, express) {
    const stations = state.stations;
    const count = stations.length;
    if (!count) return;

    const sideMargin = count >= 40 ? 40 : count >= 30 ? 45 : count >= 24 ? 55 : 80;
    const left = sideMargin;
    const right = sideMargin;
    const gap = 1;
    const available = 1276 - left - right;
    const cellWidth = (available - gap * (count - 1)) / count;
    // Five characters use 100% height; longer names step down (85%, 73%, 63%…)
    // so long vertical names stay full without stretching short names apart.
    const iconY = 122;
    const baseNameTop = 140;
    const maxHeight = 116;
    const baseStationSize = (maxHeight / 5) * 0.98;
    const columnGap = 1.5;

    const layouts = stations.map((station) => {
      const [mainName, noteName] = splitStationName(station.name || "未命名");
      // Main names always stay in one column. Only a trailing parenthetical
      // gets a second column.
      const columns = [{ chars: Array.from(mainName) }];
      if (noteName) columns.push({ chars: Array.from(noteName) });
      return { columns };
    });

    // Prioritize a readable character width. Only after that is the remaining
    // horizontal space distributed between stations.
    const internalGaps = layouts.reduce(
      (sum, layout) => sum + Math.max(0, layout.columns.length - 1) * columnGap,
      0
    );
    const totalColumns = layouts.reduce((sum, layout) => sum + layout.columns.length, 0);
    const minStationGap = 2;
    const targetGlyphWidth = Math.max(5, Math.min(
      baseStationSize,
      (available - internalGaps - (count - 1) * minStationGap) / totalColumns
    ));
    const blockWidths = layouts.map((layout) =>
      layout.columns.length * targetGlyphWidth + (layout.columns.length - 1) * columnGap
    );
    const usedWidth = blockWidths.reduce((sum, width) => sum + width, 0);
    const stationGap = count > 1 ? Math.max(minStationGap, (available - usedWidth) / (count - 1)) : 0;
    const stationCenters = [];
    let cursor = left;
    blockWidths.forEach((width) => {
      stationCenters.push(cursor + width / 2);
      cursor += width + stationGap;
    });

    stations.forEach((station, index) => {
      const center = stationCenters[index];
      const hasMetro = station.icon || station.autoMetro;
      const hasHospital = station.hospital || station.autoHospital;
      const flags = state.showIcons
        ? [hasMetro ? "metro" : null, hasHospital ? "hospital" : null].filter(Boolean)
        : [];
      if (flags.length) {
        const iconSize = flags.length > 1
          ? Math.max(10, Math.min(15, (cellWidth - 3) / 2))
          : Math.max(10, Math.min(16, cellWidth - 2));
        const flagGap = 1;
        const totalWidth = flags.length * iconSize + (flags.length - 1) * flagGap;
        let flagX = center - totalWidth / 2;

        flags.forEach((flag) => {
          if (flag === "metro") {
            if (renderAssets.metroIcon) {
              const iconHeight = iconSize * 141 / 165;
              ctx.drawImage(renderAssets.metroIcon, flagX, iconY, iconSize, iconHeight);
            } else {
              ctx.save();
              ctx.fillStyle = "#078649";
              ctx.beginPath();
              ctx.arc(flagX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#ffffff";
              ctx.font = `700 ${Math.max(6, iconSize * 0.55)}px ${CANVAS_NUMBER_FONT}`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("M", flagX + iconSize / 2, iconY + iconSize / 2 + 0.5);
              ctx.restore();
            }
          } else if (renderAssets.hospitalIcon) {
            const iconHeight = iconSize * renderAssets.hospitalIcon.height / renderAssets.hospitalIcon.width;
            ctx.drawImage(renderAssets.hospitalIcon, flagX, iconY, iconSize, iconHeight);
          } else {
            const arm = Math.max(4, iconSize * 0.34);
            ctx.save();
            ctx.fillStyle = "#d7000f";
            ctx.fillRect(flagX + iconSize / 2 - arm / 2, iconY, arm, iconSize);
            ctx.fillRect(flagX, iconY + iconSize / 2 - arm / 2, iconSize, arm);
            ctx.restore();
          }
          flagX += iconSize + flagGap;
        });
      }

      const columns = layouts[index].columns;
      const totalWidth = columns.length * targetGlyphWidth + (columns.length - 1) * columnGap;
      const firstColumnX = center - totalWidth / 2 + targetGlyphWidth / 2;

      ctx.save();
      ctx.fillStyle = station.id === (state.selectedStationId || state.stations[0]?.id)
        ? "#e2000b"
        : "#181818";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      columns.forEach((column, columnIndex) => {
        const columnX = firstColumnX + columnIndex * (targetGlyphWidth + columnGap);
        const charCount = Math.max(1, column.chars.length);
        const size = Math.max(5, baseStationSize * stationHeightScale(charCount));
        const glyphScale = Math.min(3.2, targetGlyphWidth / size);
        const step = charCount > 1 ? (maxHeight - size) / (charCount - 1) : 0;
        ctx.font = `${index === 0 ? 600 : 500} ${size}px ${CANVAS_CHINESE_FONT}`;
        column.chars.forEach((char, charIndex) => {
          if (char === " ") return;
          const charY = baseNameTop + size / 2 + charIndex * step;
          drawVerticalGlyph(ctx, char, columnX, charY, glyphScale);
        });
      });
      ctx.restore();
    });
  }

  function drawCanvasRegularBottom(ctx, barColor) {
    const top = 258;
    const height = 56;
    ctx.save();
    ctx.fillStyle = barColor;
    ctx.fillRect(0, top, 1276, height);

    ctx.fillStyle = "#f4e600";
    ctx.beginPath();
    ctx.moveTo(82, top + 16);
    ctx.lineTo(1067, top + 16);
    ctx.lineTo(1090, top + 18.5);
    ctx.lineTo(1067, top + 21);
    ctx.lineTo(82, top + 21);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 40px ${CANVAS_CHINESE_FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const charWidth = ctx.measureText("公").width;
    const areaLeft = 196;
    const areaRight = 1046;
    const letterGap = (areaRight - areaLeft - charWidth * 4) / 3;
    ctx.save();
    ctx.translate(0, top + 44);
    ctx.scale(1, 0.58);
    ["公", "共", "汽", "车"].forEach((char, index) => {
      ctx.fillText(char, areaLeft + index * (charWidth + letterGap), 0);
    });
    ctx.restore();

    if (state.showDate && String(state.dateStamp || "").trim()) {
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = `400 15px ${CANVAS_CHINESE_FONT}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(state.dateStamp, 1210, top + 48);
    }
    ctx.restore();
  }

  function drawCanvasExpressBottom(ctx, barColor) {
    const top = 258;
    const height = 56;
    ctx.save();
    ctx.fillStyle = barColor;
    ctx.fillRect(0, top, 1276, height);

    const next = resolveNextStop();
    const dest = resolveDestination();
    const fare = String(state.fare || "").trim() || "一票制一元";
    const text = `下站${next}　开往${dest}　${fare}`;
    let fontSize = 26;
    while (fontSize > 14) {
      ctx.font = `500 ${fontSize}px ${CANVAS_CHINESE_FONT}`;
      if (ctx.measureText(text).width <= 850) break;
      fontSize -= 0.5;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(70, top + 4, 920, height - 8);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, 70, top + 37);
    ctx.restore();

    drawCanvasCompanyLogo(ctx, state.company, 1099, top + 5, 152, 46, true, true);
    ctx.restore();
  }

  function buildExportName(scale) {
    const route = String(state.routeNumber || "线路").trim() || "线路";
    const suffix = state.express ? "快线" : (COMPANY_META[state.company]?.short || "常规");
    const safe = `${route}_${suffix}_${scale}x`.replace(/[\\/:*?"<>|]/g, "_");
    return `公交站牌_${safe}.png`;
  }

  function setExportBusy(busy) {
    if (els.btnExport) {
      els.btnExport.disabled = busy;
      els.btnExport.textContent = busy ? "正在导出…" : "下载 PNG";
    }
    if (els.btnExportTop) els.btnExportTop.disabled = busy;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Image failed to load: ${src}`));
      image.src = src;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      }, "image/png");
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------------------------------------------------------------------- */
  /* Misc                                                                   */
  /* ---------------------------------------------------------------------- */

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      const existing = id ? document.getElementById(id) : null;
      if (existing) {
        if (window.AMap) resolve();
        else existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }
      const script = document.createElement("script");
      if (id) script.id = id;
      script.src = src;
      script.async = true;
      const timer = window.setTimeout(() => reject(new Error("Script load timeout")), 15000);
      script.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(new Error(`Script failed to load: ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  function cleanPoiName(name) {
    let value = String(name || "").trim().replace(/\s+/g, " ");
    value = value.replace(/\s*[（(]公交站[)）]\s*$/g, "").trim();
    value = value.replace(/(?:-|—)?公交站$/g, "").trim();
    return value || String(name || "公交站").trim();
  }

  function distanceMeters(lng1, lat1, lng2, lat2) {
    const rad = Math.PI / 180;
    const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * rad) * 111320;
    const y = (lat2 - lat1) * 110540;
    return Math.hypot(x, y);
  }

  function formatDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value) || value <= 0) return "附近";
    if (value < 1000) return `${Math.round(value)} m`;
    return `${(value / 1000).toFixed(1)} km`;
  }

  function fitPreview() {
    if (!els.previewViewport || !els.previewScaler) return;
    const width = els.previewViewport.clientWidth;
    if (!width) return;
    const padding = 18;
    const available = Math.max(120, width - padding * 2);
    const scale = Math.min(1, available / 1280);
    const height = Math.ceil(318 * scale + padding * 2);
    els.previewViewport.style.height = `${height}px`;
    els.previewScaler.style.transform = `scale(${scale})`;
    els.previewScaler.style.left = `${(width - 1280 * scale) / 2}px`;
    els.previewScaler.style.top = `${padding}px`;
  }

  function observePreview() {
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => fitPreview());
    observer.observe(els.previewViewport);
  }

  function showToast(message, isError = false) {
    if (!els.toast) return;
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.className = `toast is-show${isError ? " is-error" : ""}`;
    toastTimer = window.setTimeout(() => {
      els.toast.className = "toast";
    }, 2800);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
