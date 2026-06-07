(function () {
  "use strict";

  if (window.MindustryMitJsonEditorLoaded) return;
  window.MindustryMitJsonEditorLoaded = true;

  const STORAGE_KEY = "mindustrymit.table-editor.project.v2";
  const SYNC_DELAY_MS = 260;
  const REQUEST_TIMEOUT_MS = 6000;

  const CONTENT_KINDS = [
    ["blocks", "方块"],
    ["items", "物品"],
    ["liquids", "液体"],
    ["units", "单位"],
    ["status-effects", "状态"],
    ["weathers", "天气"],
    ["planets", "星球"],
  ];

  const DEFAULT_CLASS_BY_KIND = {
    blocks: "Wall",
    items: "Item",
    liquids: "Liquid",
    units: "UnitType",
    "status-effects": "StatusEffect",
    weathers: "Weather",
    planets: "Planet",
  };

  const KIND_BY_CLASS = {
    Item: "items",
    Liquid: "liquids",
    UnitType: "units",
    StatusEffect: "status-effects",
    Weather: "weathers",
    Planet: "planets",
  };

  const OUTPUT_TYPES = {
    Init: { Success: "boolean", Doc_Count: "int", Message: "string" },
    AllClass: { Class_List: "list" },
    AllField: { Field_List: "list" },
    FieldDoc: { Field_Doc: "string" },
    FieldDefaultValue: { Default_Value: "string" },
    GetFieldValue: { Success: "boolean", Value: "string", Message: "string" },
    SetFieldValue: { Success: "boolean", Value: "string", Message: "string" },
    AddElement: { Success: "boolean", Index: "int", Message: "string" },
    ExportClass: { Success: "boolean", Content: "string", Message: "string" },
    NewClass: { Class_Id: "int" },
    RemoveClass: { Success: "boolean" },
    FetchDoc: { Success: "boolean", Doc_Count: "int", Message: "string" },
  };

  const LOCAL_TYPES = [
    typeDef("Content", "", "Mindustry 内容基类。"),
    typeDef("UnlockableContent", "Content", "可解锁内容，常用于方块、物品、液体和单位。"),
    typeDef("Block", "UnlockableContent", "所有方块的基础类型。"),
    typeDef("Wall", "Block", "防御墙。适合新人从这里开始。"),
    typeDef("Drill", "Block", "采矿方块。"),
    typeDef("Conveyor", "Block", "物品运输方块。"),
    typeDef("Router", "Block", "物品分配方块。"),
    typeDef("Turret", "Block", "炮塔基础类型。"),
    typeDef("Item", "UnlockableContent", "物品定义。"),
    typeDef("Liquid", "UnlockableContent", "液体定义。"),
    typeDef("UnitType", "UnlockableContent", "单位定义。"),
    typeDef("StatusEffect", "Content", "状态效果。"),
    typeDef("Weather", "Content", "天气效果。"),
    typeDef("Planet", "Content", "星球定义。"),
    typeDef("ItemStack", "", "物品和数量对象，常用于 requirements。"),
    typeDef("Weapon", "", "单位武器对象。"),
    typeDef("BulletType", "", "子弹对象。"),
  ];

  const LOCAL_FIELDS = {
    Content: [
      fieldDef("name", "String", "", "内部名称。通常由文件名决定，必要时也可显式填写。"),
    ],
    UnlockableContent: [
      fieldDef("localizedName", "String", "", "游戏内显示名称。"),
      fieldDef("description", "String", "", "鼠标悬停或数据库中显示的说明。"),
      fieldDef("alwaysUnlocked", "Boolean", "false", "是否默认解锁。"),
      fieldDef("research", "String", "", "科技树前置内容名称。", { accepts: ["Block", "Item", "Liquid", "UnitType"] }),
    ],
    Block: [
      fieldDef("size", "Int", "1", "方块占地尺寸。1 表示 1x1。", { required: true }),
      fieldDef("health", "Int", "100", "方块生命值。", { required: true }),
      fieldDef("category", "String", "defense", "建造菜单分类，例如 defense、crafting、distribution。"),
      fieldDef("requirements", "Array<ItemStack>", "", "建造消耗。使用数组元素添加物品和数量。", { accepts: ["ItemStack"] }),
      fieldDef("buildVisibility", "String", "shown", "建造菜单可见性。"),
      fieldDef("solid", "Boolean", "true", "是否为实体阻挡方块。"),
      fieldDef("hasItems", "Boolean", "false", "是否存储物品。"),
      fieldDef("hasLiquids", "Boolean", "false", "是否存储液体。"),
      fieldDef("hasPower", "Boolean", "false", "是否接入电力。"),
    ],
    Wall: [
      fieldDef("armor", "Float", "0", "额外护甲。"),
      fieldDef("absorbLasers", "Boolean", "false", "是否吸收激光。"),
      fieldDef("insulated", "Boolean", "false", "是否绝缘。"),
    ],
    Drill: [
      fieldDef("drillTime", "Float", "280", "采矿所需时间。", { required: true }),
      fieldDef("tier", "Int", "2", "可采矿物等级。"),
      fieldDef("liquidBoostIntensity", "Float", "1.6", "液体加速倍率。"),
      fieldDef("drawMineItem", "Boolean", "true", "是否绘制正在采集的矿物。"),
    ],
    Conveyor: [
      fieldDef("speed", "Float", "0.08", "运输速度。", { required: true }),
      fieldDef("displayedSpeed", "Float", "11", "UI 显示速度。"),
      fieldDef("junctionReplacement", "String", "", "拖拽放置时替换为的交叉器。", { accepts: ["Block"] }),
      fieldDef("bridgeReplacement", "String", "", "拖拽放置时替换为的桥。", { accepts: ["Block"] }),
    ],
    Router: [
      fieldDef("speed", "Float", "8", "分发速度。"),
      fieldDef("itemCapacity", "Int", "1", "物品容量。"),
    ],
    Turret: [
      fieldDef("range", "Float", "160", "射程。", { required: true }),
      fieldDef("reload", "Float", "45", "装填时间。"),
      fieldDef("targetAir", "Boolean", "true", "是否攻击空中目标。"),
      fieldDef("targetGround", "Boolean", "true", "是否攻击地面目标。"),
      fieldDef("shootCone", "Float", "20", "射击角度容差。"),
      fieldDef("inaccuracy", "Float", "0", "散布。"),
      fieldDef("ammoTypes", "Object", "{}", "弹药到子弹的映射对象。复杂炮塔建议导入 JSON 后编辑。", { accepts: ["BulletType"] }),
    ],
    Item: [
      fieldDef("color", "Color", "#d99d73", "物品颜色。"),
      fieldDef("cost", "Float", "1", "建造成本倍率。"),
      fieldDef("hardness", "Int", "1", "矿物硬度。"),
      fieldDef("explosiveness", "Float", "0", "爆炸性。"),
      fieldDef("flammability", "Float", "0", "易燃性。"),
      fieldDef("radioactivity", "Float", "0", "放射性。"),
      fieldDef("charge", "Float", "0", "电荷属性。"),
    ],
    Liquid: [
      fieldDef("color", "Color", "#6ec7ff", "液体颜色。"),
      fieldDef("temperature", "Float", "0.5", "温度。"),
      fieldDef("viscosity", "Float", "0.5", "黏度。"),
      fieldDef("heatCapacity", "Float", "0.5", "热容量。"),
      fieldDef("flammability", "Float", "0", "易燃性。"),
      fieldDef("explosiveness", "Float", "0", "爆炸性。"),
    ],
    UnitType: [
      fieldDef("health", "Int", "360", "单位生命值。", { required: true }),
      fieldDef("speed", "Float", "1.2", "移动速度。"),
      fieldDef("armor", "Float", "0", "护甲。"),
      fieldDef("flying", "Boolean", "false", "是否飞行。"),
      fieldDef("itemCapacity", "Int", "0", "物品容量。"),
      fieldDef("weapons", "Array<Weapon>", "", "武器列表。", { accepts: ["Weapon"] }),
    ],
    Weapon: [
      fieldDef("name", "String", "weapon", "武器名称。"),
      fieldDef("reload", "Float", "30", "装填时间。"),
      fieldDef("x", "Float", "0", "挂点 X。"),
      fieldDef("y", "Float", "0", "挂点 Y。"),
      fieldDef("mirror", "Boolean", "true", "是否镜像。"),
      fieldDef("bullet", "Object", "{}", "子弹对象。", { accepts: ["BulletType"] }),
    ],
    BulletType: [
      fieldDef("damage", "Float", "20", "伤害。", { required: true }),
      fieldDef("speed", "Float", "4", "子弹速度。"),
      fieldDef("lifetime", "Float", "60", "存在时间。"),
      fieldDef("width", "Float", "7", "宽度。"),
      fieldDef("height", "Float", "9", "高度。"),
      fieldDef("splashDamage", "Float", "0", "范围伤害。"),
      fieldDef("splashDamageRadius", "Float", "0", "范围伤害半径。"),
    ],
    ItemStack: [
      fieldDef("item", "String", "copper", "物品名称。", { required: true, accepts: ["Item"] }),
      fieldDef("amount", "Int", "20", "数量。", { required: true }),
    ],
    StatusEffect: [
      fieldDef("color", "Color", "#f2b95f", "状态颜色。"),
      fieldDef("damage", "Float", "0", "每帧伤害。"),
      fieldDef("speedMultiplier", "Float", "1", "速度倍率。"),
      fieldDef("healthMultiplier", "Float", "1", "生命倍率。"),
    ],
    Weather: [
      fieldDef("duration", "Float", "600", "持续时间。"),
      fieldDef("opacityMultiplier", "Float", "1", "透明度倍率。"),
      fieldDef("drawNoise", "Boolean", "true", "是否绘制噪声效果。"),
    ],
    Planet: [
      fieldDef("radius", "Float", "1", "半径。"),
      fieldDef("visible", "Boolean", "true", "是否可见。"),
      fieldDef("atmosphereColor", "Color", "#74d3ff", "大气颜色。"),
      fieldDef("startSector", "Int", "0", "起始区块。"),
    ],
  };

  const state = {
    backend: null,
    project: null,
    classes: [],
    fieldCache: new Map(),
    fieldDetails: new Map(),
    selectedId: "manifest",
    activeAssetId: null,
    view: "table",
    filters: { kind: "all", asset: "", className: "" },
    feedback: [],
    logs: [],
    backendExport: "",
    syncTimers: new Map(),
    mockClassId: 1,
  };

  const dom = {};

  class BackendBridge {
    constructor() {
      this.mode = "offline";
      this.socket = null;
      this.pending = [];
    }

    connect(url) {
      this.close();
      return new Promise((resolve, reject) => {
        if (!("WebSocket" in window)) {
          reject(new Error("当前浏览器不支持 WebSocket"));
          return;
        }

        const socket = new WebSocket(url);
        let settled = false;
        const timer = window.setTimeout(() => {
          socket.close();
          finish(false, new Error("连接超时"));
        }, 2500);

        const finish = (ok, value) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          ok ? resolve(value) : reject(value);
        };

        socket.addEventListener("open", () => {
          this.socket = socket;
          this.mode = "ws";
          addLog("info", `已连接 ${url}`);
          finish(true);
        });

        socket.addEventListener("message", (event) => this.handleMessage(event.data));

        socket.addEventListener("close", () => {
          if (this.mode === "ws") addLog("warning", "WebSocket 已断开，切换到离线目录");
          this.mode = "offline";
          this.socket = null;
          this.rejectPending("WebSocket 已断开");
          renderConnection();
        });

        socket.addEventListener("error", () => {
          finish(false, new Error("无法连接后端"));
        });
      });
    }

    close() {
      if (this.socket) this.socket.close();
      this.socket = null;
      this.mode = "offline";
      this.rejectPending("连接已关闭");
    }

    request(wsType, payload) {
      if (this.mode !== "ws" || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return Promise.resolve(mockRequest(wsType, payload || {}));
      }

      const packet = {
        wsType,
        content: JSON.stringify(payload || {}),
        out: false,
        dataList: {},
      };

      return new Promise((resolve, reject) => {
        const item = {
          wsType,
          resolve,
          reject,
          timer: window.setTimeout(() => {
            this.pending = this.pending.filter((entry) => entry !== item);
            reject(new Error(`${wsType} 响应超时`));
          }, REQUEST_TIMEOUT_MS),
        };
        this.pending.push(item);
        this.socket.send(JSON.stringify(packet));
      });
    }

    handleMessage(raw) {
      const text = String(raw || "");
      if (text.startsWith("Echo:")) return;

      let packet;
      try {
        packet = JSON.parse(text);
      } catch (_) {
        addLog("warning", text.slice(0, 180));
        return;
      }

      const index = this.pending.findIndex((item) => item.wsType === packet.wsType);
      const item = index >= 0 ? this.pending.splice(index, 1)[0] : this.pending.shift();
      if (!item) {
        addLog("info", `${packet.wsType || "response"} ${text.slice(0, 180)}`);
        return;
      }

      window.clearTimeout(item.timer);
      item.resolve(decodeReply(packet));
    }

    rejectPending(message) {
      this.pending.splice(0).forEach((item) => {
        window.clearTimeout(item.timer);
        item.reject(new Error(message));
      });
    }
  }

  function typeDef(name, parentType, doc) {
    return { name, parentType, doc };
  }

  function fieldDef(name, type, defaultValue, doc, options) {
    const opts = options || {};
    return {
      name,
      type,
      defaultValue: String(defaultValue ?? ""),
      doc,
      required: Boolean(opts.required),
      accepts: opts.accepts || [],
    };
  }

  function boot() {
    cacheDom();
    state.backend = new BackendBridge();
    state.project = loadProject() || createStarterProject();
    state.activeAssetId = state.project.assets[0]?.id || null;
    state.selectedId = state.activeAssetId ? state.project.assets[0].root.id : "manifest";
    state.classes = getLocalClasses();

    bindEvents();
    hydrateProject(state.project);
    populateStaticControls();
    validateProject(false);
    renderAll();
  }

  function cacheDom() {
    [
      "connectionState", "connectionForm", "wsUrl", "dataDir", "kindFilter", "assetSearch",
      "assetList", "classCount", "classSearch", "classList", "activeTitle", "activePath",
      "assetConfig", "fieldSelect", "editorBody", "selectionKind", "inspectorBody",
      "livePreview", "problemCount", "feedbackList", "newDialog", "newContentForm",
      "newKind", "newClassName", "fileInput", "toastRegion",
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    dom.fileInput.addEventListener("change", handleFileImport);
  }

  function populateStaticControls() {
    dom.newKind.innerHTML = CONTENT_KINDS
      .map(([value, label]) => `<option value="${esc(value)}">${esc(value)} · ${esc(label)}</option>`)
      .join("");
    populateClassSelect(dom.newClassName, DEFAULT_CLASS_BY_KIND.blocks);
  }

  function handleClick(event) {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
      state.view = viewButton.dataset.view;
      renderEditor();
      renderViewTabs();
      return;
    }

    const assetButton = event.target.closest("[data-asset-id]");
    if (assetButton) {
      selectAsset(assetButton.dataset.assetId);
      return;
    }

    const row = event.target.closest("[data-select-id]");
    if (row && !event.target.closest("input, select, textarea, button")) {
      selectNode(row.dataset.selectId);
      return;
    }

    const classButton = event.target.closest("[data-class-name]");
    if (classButton && !event.target.closest("[data-action]")) {
      state.filters.className = classButton.dataset.className;
      openNewDialog(classButton.dataset.className);
      return;
    }

    const action = event.target.closest("[data-action]");
    if (action) runAction(action.dataset.action, action);
  }

  function handleInput(event) {
    const target = event.target;

    if (target.id === "assetSearch") {
      state.filters.asset = target.value;
      renderAssets();
      return;
    }

    if (target.id === "classSearch") {
      state.filters.className = target.value;
      renderClasses();
      return;
    }

    if (target.dataset.manifest) {
      state.project.manifest[target.dataset.manifest] = target.value;
      if (target.dataset.manifest === "name") state.project.manifest.name = slugify(target.value);
      validateProject(false);
      renderAssets();
      renderPreview();
      renderFeedback();
      return;
    }

    if (target.dataset.assetFile) {
      const asset = getActiveAsset();
      if (!asset) return;
      asset.fileName = slugify(target.value);
      asset.root.instanceName = asset.fileName;
      updateAssetPath(asset);
      validateProject(false);
      renderAssets();
      renderHeader();
      renderPreview();
      renderFeedback();
      return;
    }

    if (target.dataset.fieldValue) {
      updateFieldValue(target.dataset.fieldValue, target.value);
      return;
    }

    if (target.dataset.elementValue) {
      updateElementValue(target.dataset.elementValue, target.value);
    }
  }

  function handleChange(event) {
    const target = event.target;

    if (target.id === "kindFilter") {
      state.filters.kind = target.value;
      renderAssets();
      return;
    }

    if (target.id === "newKind") {
      populateClassSelect(dom.newClassName, DEFAULT_CLASS_BY_KIND[target.value] || "Block");
      dom.newContentForm.elements.fileName.value = uniqueFileName(target.value, dom.newClassName.value);
      return;
    }

    if (target.id === "newClassName") {
      const kind = kindForClass(target.value);
      dom.newKind.value = kind;
      dom.newContentForm.elements.fileName.value = uniqueFileName(kind, target.value);
      return;
    }

    if (target.dataset.assetKind) {
      const asset = getActiveAsset();
      if (!asset) return;
      asset.kind = target.value;
      updateAssetPath(asset);
      validateProject(false);
      renderAll();
      return;
    }

    if (target.dataset.assetClass) {
      changeAssetClass(target.value);
      return;
    }

    if (target.dataset.fieldValue) {
      updateFieldValue(target.dataset.fieldValue, target.value);
      return;
    }

    if (target.dataset.fieldBoolean) {
      updateFieldValue(target.dataset.fieldBoolean, target.checked ? "true" : "false");
      return;
    }

    if (target.dataset.elementValue) {
      updateElementValue(target.dataset.elementValue, target.value);
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "connectionForm") {
      event.preventDefault();
      connectBackend();
      return;
    }

    if (event.target.id === "newContentForm") {
      event.preventDefault();
      const form = new FormData(event.target);
      const asset = createAsset(form.get("fileName"), form.get("kind"), form.get("className"));
      state.project.assets.push(asset);
      closeNewDialog();
      selectAsset(asset.id);
      ensureBackendClass(asset);
      saveProject(false);
    }
  }

  function runAction(action, target) {
    switch (action) {
      case "open-new-dialog":
        openNewDialog(target.dataset.className);
        break;
      case "close-new-dialog":
        closeNewDialog();
        break;
      case "import-json":
        dom.fileInput.click();
        break;
      case "save-project":
        saveProject(true);
        break;
      case "validate-project":
        validateProject(true);
        state.view = "table";
        renderAll();
        break;
      case "download-current":
        downloadCurrentJson();
        break;
      case "copy-current-json":
        copyCurrentJson();
        break;
      case "select-manifest":
        state.selectedId = "manifest";
        renderAll();
        break;
      case "init-backend":
        initBackend();
        break;
      case "add-selected-field":
        addSelectedField();
        break;
      case "add-field-from-inspector":
        addFieldFromInspector(target.dataset.fieldName);
        break;
      case "delete-asset":
        deleteActiveAsset();
        break;
      case "delete-field":
        deleteField(target.dataset.fieldId);
        break;
      case "reset-field":
        resetField(target.dataset.fieldId);
        break;
      case "create-object":
        createObjectForField(target.dataset.fieldId);
        break;
      case "clear-object":
        clearObjectForField(target.dataset.fieldId);
        break;
      case "add-element-to-field":
        addElementToField(target.dataset.fieldId);
        break;
      case "delete-element":
        deleteElement(target.dataset.elementId);
        break;
      case "move-element-up":
        moveElement(target.dataset.elementId, -1);
        break;
      case "move-element-down":
        moveElement(target.dataset.elementId, 1);
        break;
      case "get-selected-value":
        getSelectedValueFromBackend();
        break;
      case "export-from-backend":
        exportFromBackend();
        break;
      default:
        break;
    }
  }

  function connectBackend() {
    const url = dom.wsUrl.value.trim();
    if (!url) return;
    addLog("info", `连接 ${url}`);
    state.backend.connect(url)
      .then(() => {
        renderConnection();
        return refreshClassList();
      })
      .then(() => {
        toast("WebSocket 已连接", "success");
      })
      .catch((error) => {
        addLog("error", error.message);
        toast(error.message, "error");
        renderConnection();
      });
  }

  function initBackend() {
    const dataDir = dom.dataDir.value.trim();
    callApi("Init", { Data_Dir: dataDir })
      .then((reply) => {
        addLog(reply.Success ? "info" : "warning", reply.Message || "Init 完成");
        toast(reply.Message || "Init 完成", reply.Success ? "success" : "warning");
        return refreshClassList();
      })
      .catch(showApiError);
  }

  function refreshClassList() {
    return callApi("AllClass", {}).then((reply) => {
      state.classes = unique([...getLocalClasses(), ...(reply.Class_List || [])]).sort(compareText);
      renderClasses();
      populateStaticControls();
      renderFieldSelect();
    });
  }

  function callApi(wsType, payload) {
    return state.backend.request(wsType, payload || {}).catch((error) => {
      addLog("error", `${wsType}: ${error.message}`);
      throw error;
    });
  }

  function mockRequest(wsType, payload) {
    switch (wsType) {
      case "Init":
        return { Success: true, Doc_Count: LOCAL_TYPES.length, Message: "离线目录已就绪" };
      case "AllClass":
        return { Class_List: getLocalClasses() };
      case "AllField":
        return { Field_List: getFields(payload.Class_Name).map((field) => field.name) };
      case "FieldDoc": {
        const meta = getField(payload.Class_Name, payload.Field_Name);
        return { Field_Doc: meta?.doc || "" };
      }
      case "FieldDefaultValue": {
        const meta = getField(payload.Class_Name, payload.Field_Name);
        return { Default_Value: meta?.defaultValue ?? "null" };
      }
      case "NewClass":
        return { Class_Id: state.mockClassId++ };
      case "SetFieldValue":
        return { Success: true, Value: payload.Value || "", Message: "" };
      case "GetFieldValue":
        return { Success: true, Value: "", Message: "离线模式没有后端字段值" };
      case "AddElement":
        return { Success: true, Index: 0, Message: "" };
      case "ExportClass":
        return { Success: true, Content: JSON.stringify(getActiveJson(), null, 2), Message: "" };
      case "RemoveClass":
        return { Success: true };
      default:
        return {};
    }
  }

  function decodeReply(packet) {
    const shape = OUTPUT_TYPES[packet.wsType] || {};
    const source = packet.dataList || {};
    const result = {};
    Object.entries(shape).forEach(([key, type]) => {
      result[key] = decodeData(source[key], type);
    });
    return result;
  }

  function decodeData(data, type) {
    if (!data) {
      if (type === "list") return [];
      if (type === "boolean") return false;
      if (type === "int") return 0;
      if (type === "float") return 0;
      return "";
    }
    if (type === "list") return (data.list || []).map((item) => item.str || String(item.int || item.float || ""));
    if (type === "boolean") return Boolean(data.boolean);
    if (type === "int") return Number(data.int) || 0;
    if (type === "float") return Number(data.float) || 0;
    return data.str || "";
  }

  function createStarterProject() {
    const project = {
      version: 2,
      manifest: {
        name: "starter-json-mod",
        displayName: "Starter JSON Mod",
        author: "MindustryMIT",
        version: "1.0.0",
        minGameVersion: "146",
        description: "Created with MindustryMIT JSON Editor.",
      },
      assets: [],
    };
    const wall = createAsset("copper-wall", "blocks", "Wall");
    addFieldByName(wall.root, "localizedName", "Copper Wall");
    addFieldByName(wall.root, "description", "A simple starter wall.");
    addFieldByName(wall.root, "size", "1");
    addFieldByName(wall.root, "health", "320");
    const requirements = addFieldByName(wall.root, "requirements", "");
    addArrayElement(requirements, "ItemStack", { item: "copper", amount: "20" });
    project.assets.push(wall);
    return project;
  }

  function createAsset(fileName, kind, className) {
    const assetKind = kind || kindForClass(className);
    const cleanName = slugify(fileName || className || "content");
    const root = createClassNode(className || DEFAULT_CLASS_BY_KIND[assetKind] || "Block", cleanName);
    seedRecommendedFields(root);
    const asset = {
      id: uid("asset"),
      kind: assetKind,
      fileName: cleanName,
      className: root.className,
      classId: null,
      root,
      path: "",
    };
    updateAssetPath(asset);
    return asset;
  }

  function createClassNode(className, instanceName) {
    return {
      id: uid("class"),
      kind: "class",
      className,
      instanceName: instanceName || className,
      fields: [],
    };
  }

  function createField(meta, value) {
    return {
      id: uid("field"),
      kind: "field",
      name: meta.name,
      type: meta.type || "String",
      value: value ?? defaultFieldValue(meta),
      doc: meta.doc || "",
      defaultValue: meta.defaultValue ?? "",
      required: Boolean(meta.required),
      accepts: meta.accepts || [],
      child: null,
      elements: isArrayType(meta.type) ? [] : null,
    };
  }

  function createElement(value, className) {
    if (className) {
      const classNode = createClassNode(className, className);
      seedRecommendedFields(classNode, true);
      return { id: uid("element"), kind: "element", value: "", classNode };
    }
    return { id: uid("element"), kind: "element", value: String(value ?? ""), classNode: null };
  }

  function seedRecommendedFields(classNode, nested) {
    const names = recommendedFieldNames(classNode.className, nested);
    names.forEach((name) => addFieldByName(classNode, name));
  }

  function recommendedFieldNames(className, nested) {
    if (className === "Wall") return ["localizedName", "description", "size", "health", "requirements"];
    if (className === "Drill") return ["localizedName", "size", "health", "requirements", "drillTime", "tier"];
    if (className === "Conveyor") return ["localizedName", "size", "health", "requirements", "speed"];
    if (className === "Turret") return ["localizedName", "size", "health", "requirements", "range", "reload"];
    if (className === "Item") return ["localizedName", "description", "color", "cost"];
    if (className === "Liquid") return ["localizedName", "description", "color", "temperature"];
    if (className === "UnitType") return ["localizedName", "description", "health", "speed", "weapons"];
    if (className === "ItemStack") return ["item", "amount"];
    if (className === "Weapon") return ["name", "reload", "x", "y", "bullet"];
    if (className === "BulletType") return ["damage", "speed", "lifetime"];
    if (nested) return [];
    return ["localizedName", "description"];
  }

  function addFieldByName(classNode, fieldName, value) {
    if (!classNode || classNode.fields.some((field) => field.name === fieldName)) return null;
    const meta = getField(classNode.className, fieldName) || fieldDef(fieldName, "String", "", "后端字段。");
    const field = createField(meta, value);
    classNode.fields.push(field);
    return field;
  }

  function addSelectedField() {
    const asset = getActiveAsset();
    if (!asset || !dom.fieldSelect.value) return;
    const field = addFieldByName(asset.root, dom.fieldSelect.value);
    if (!field) return;
    state.selectedId = field.id;
    syncField(field.id);
    validateProject(false);
    renderAll();
  }

  function addFieldFromInspector(fieldName) {
    const selection = getSelection();
    const classNode = selection?.kind === "class" ? selection.classNode : getActiveAsset()?.root;
    if (!classNode || !fieldName) return;
    const field = addFieldByName(classNode, fieldName);
    if (!field) return;
    state.selectedId = field.id;
    syncField(field.id);
    validateProject(false);
    renderAll();
  }

  function updateFieldValue(fieldId, value) {
    const selection = findSelection(fieldId);
    if (!selection || selection.kind !== "field") return;
    selection.field.value = value;
    if (selection.field.child && !isObjectLike(selection.field)) selection.field.child = null;
    validateProject(false);
    scheduleSync(selection.field.id);
    renderPreview();
    renderFeedback();
    renderInspector();
  }

  function updateElementValue(elementId, value) {
    const selection = findSelection(elementId);
    if (!selection || selection.kind !== "element") return;
    selection.element.value = value;
    validateProject(false);
    syncField(selection.ownerField.id);
    renderPreview();
    renderFeedback();
    renderInspector();
  }

  function scheduleSync(fieldId) {
    window.clearTimeout(state.syncTimers.get(fieldId));
    const timer = window.setTimeout(() => syncField(fieldId), SYNC_DELAY_MS);
    state.syncTimers.set(fieldId, timer);
  }

  function syncField(fieldId) {
    const selection = findSelection(fieldId);
    const asset = getActiveAsset();
    if (!asset || !selection || selection.kind !== "field") return;
    ensureBackendClass(asset).then((classId) => {
      const payload = {
        Class_Id: classId,
        Field_Path: selection.path,
        Value: backendValue(selection.field),
      };
      return callApi("SetFieldValue", payload);
    }).then((reply) => {
      if (reply.Success === false) addLog("warning", reply.Message || "SetFieldValue 失败");
    }).catch((error) => addLog("error", error.message));
  }

  function backendValue(field) {
    if (field.child || field.elements) return "";
    return String(field.value ?? "");
  }

  function ensureBackendClass(asset, force) {
    if (!asset) return Promise.resolve(-1);
    if (asset.classId != null && !force) return Promise.resolve(asset.classId);
    return callApi("NewClass", { Class_Name: asset.root.className }).then((reply) => {
      asset.classId = Number.isInteger(reply.Class_Id) ? reply.Class_Id : state.mockClassId++;
      addLog("info", `NewClass ${asset.root.className} -> ${asset.classId}`);
      renderHeader();
      renderAssetConfig();
      return asset.classId;
    });
  }

  function addElementToField(fieldId) {
    const selection = findSelection(fieldId);
    const asset = getActiveAsset();
    if (!asset || !selection || selection.kind !== "field") return;
    const field = selection.field;
    if (!field.elements) field.elements = [];
    const select = document.getElementById(`elementType-${field.id}`);
    const className = select?.value || acceptedClass(field);
    const element = addArrayElement(field, className);
    state.selectedId = element.id;
    ensureBackendClass(asset)
      .then((classId) => callApi("AddElement", {
        Class_Id: classId,
        Field_Path: selection.path,
        Element_Type: className || "",
        Value: element.classNode ? "" : String(element.value || ""),
      }))
      .then((reply) => {
        if (reply.Success === false) addLog("warning", reply.Message || "AddElement 失败");
      })
      .catch((error) => addLog("error", error.message));
    validateProject(false);
    renderAll();
  }

  function addArrayElement(field, className, seedValues) {
    const actualClass = className || acceptedClass(field);
    const element = createElement("", actualClass);
    if (seedValues && element.classNode) {
      Object.entries(seedValues).forEach(([name, value]) => addFieldByName(element.classNode, name, value));
    }
    field.elements ||= [];
    field.elements.push(element);
    return element;
  }

  function createObjectForField(fieldId) {
    const selection = findSelection(fieldId);
    if (!selection || selection.kind !== "field") return;
    const select = document.getElementById(`objectType-${fieldId}`);
    const className = select?.value || acceptedClass(selection.field) || "BulletType";
    selection.field.child = createClassNode(className, className);
    seedRecommendedFields(selection.field.child, true);
    selection.field.value = "";
    state.selectedId = selection.field.child.id;
    syncField(selection.field.id);
    validateProject(false);
    renderAll();
  }

  function clearObjectForField(fieldId) {
    const selection = findSelection(fieldId);
    if (!selection || selection.kind !== "field") return;
    selection.field.child = null;
    selection.field.value = selection.field.defaultValue || "{}";
    state.selectedId = selection.field.id;
    syncField(selection.field.id);
    validateProject(false);
    renderAll();
  }

  function deleteField(fieldId) {
    const asset = getActiveAsset();
    const selection = findSelection(fieldId);
    if (!asset || !selection || selection.kind !== "field") return;
    selection.owner.fields = selection.owner.fields.filter((field) => field.id !== fieldId);
    state.selectedId = selection.owner.id;
    validateProject(false);
    renderAll();
  }

  function resetField(fieldId) {
    const selection = findSelection(fieldId);
    if (!selection || selection.kind !== "field") return;
    selection.field.value = selection.field.defaultValue || defaultValueByType(selection.field.type);
    selection.field.child = null;
    selection.field.elements = isArrayType(selection.field.type) ? [] : null;
    syncField(fieldId);
    validateProject(false);
    renderAll();
  }

  function deleteElement(elementId) {
    const selection = findSelection(elementId);
    if (!selection || selection.kind !== "element") return;
    selection.ownerField.elements.splice(selection.index, 1);
    state.selectedId = selection.ownerField.id;
    syncField(selection.ownerField.id);
    validateProject(false);
    renderAll();
  }

  function moveElement(elementId, direction) {
    const selection = findSelection(elementId);
    if (!selection || selection.kind !== "element") return;
    const list = selection.ownerField.elements;
    const next = selection.index + direction;
    if (next < 0 || next >= list.length) return;
    [list[selection.index], list[next]] = [list[next], list[selection.index]];
    syncField(selection.ownerField.id);
    renderAll();
  }

  function changeAssetClass(className) {
    const asset = getActiveAsset();
    if (!asset || asset.root.className === className) return;
    asset.className = className;
    asset.kind = kindForClass(className);
    asset.root = createClassNode(className, asset.fileName);
    seedRecommendedFields(asset.root);
    asset.classId = null;
    updateAssetPath(asset);
    state.selectedId = asset.root.id;
    ensureBackendClass(asset, true);
    validateProject(false);
    renderAll();
  }

  function deleteActiveAsset() {
    const asset = getActiveAsset();
    if (!asset) return;
    if (asset.classId != null) callApi("RemoveClass", { Class_Id: asset.classId }).catch(() => {});
    state.project.assets = state.project.assets.filter((item) => item.id !== asset.id);
    state.activeAssetId = state.project.assets[0]?.id || null;
    state.selectedId = state.activeAssetId ? state.project.assets[0].root.id : "manifest";
    validateProject(false);
    renderAll();
  }

  function getSelectedValueFromBackend() {
    const asset = getActiveAsset();
    const selection = findSelection(state.selectedId);
    if (!asset || !selection || !selection.path) {
      toast("请选择字段或数组元素", "warning");
      return;
    }
    ensureBackendClass(asset)
      .then((classId) => callApi("GetFieldValue", { Class_Id: classId, Field_Path: selection.path }))
      .then((reply) => {
        addLog(reply.Success ? "info" : "warning", reply.Message || `Value: ${reply.Value}`);
        if (reply.Value) toast(reply.Value, "success");
      })
      .catch(showApiError);
  }

  function exportFromBackend() {
    const asset = getActiveAsset();
    if (!asset) return;
    ensureBackendClass(asset)
      .then((classId) => callApi("ExportClass", { Class_Id: classId }))
      .then((reply) => {
        state.backendExport = reply.Content || "";
        state.view = "backend";
        renderAll();
      })
      .catch(showApiError);
  }

  function renderAll() {
    renderConnection();
    renderManifest();
    renderAssets();
    renderClasses();
    renderHeader();
    renderAssetConfig();
    renderFieldSelect();
    renderViewTabs();
    renderEditor();
    renderInspector();
    renderPreview();
    renderFeedback();
  }

  function renderConnection() {
    const online = state.backend?.mode === "ws";
    dom.connectionState.textContent = online ? "后端已连接" : "离线模式";
    dom.connectionState.className = online ? "online" : "";
  }

  function renderManifest() {
    Object.entries(state.project.manifest).forEach(([key, value]) => {
      const input = document.querySelector(`[data-manifest="${key}"]`);
      if (input && input !== document.activeElement) input.value = value;
    });
  }

  function renderAssets() {
    const assets = state.project.assets.filter((asset) => {
      const kindOk = state.filters.kind === "all" || asset.kind === state.filters.kind;
      const query = state.filters.asset.trim().toLowerCase();
      const text = `${asset.fileName} ${asset.className} ${asset.path}`.toLowerCase();
      return kindOk && (!query || text.includes(query));
    });

    dom.assetList.innerHTML = assets.length ? assets.map((asset) => `
      <button type="button" class="asset-item ${asset.id === state.activeAssetId ? "is-active" : ""}" data-asset-id="${esc(asset.id)}">
        <span class="kind-token ${esc(asset.kind)}">${esc(kindShort(asset.kind))}</span>
        <span>
          <strong>${esc(asset.fileName)}</strong>
          <span>${esc(asset.className)} · ${esc(asset.path)}</span>
        </span>
        <span class="asset-count">${asset.root.fields.length}</span>
      </button>
    `).join("") : `<div class="empty-state"><strong>没有内容文件</strong><span>使用顶部的新建按钮创建第一个 JSON。</span></div>`;
  }

  function renderClasses() {
    const query = state.filters.className.trim().toLowerCase();
    const classes = getAllClasses().filter((className) => {
      if (!query) return true;
      const fields = getFields(className).map((field) => field.name).join(" ");
      return `${className} ${fields}`.toLowerCase().includes(query);
    });

    dom.classCount.textContent = String(classes.length);
    dom.classList.innerHTML = classes.map((className) => {
      const meta = getType(className);
      const fieldCount = getFields(className).length;
      return `
        <button type="button" class="class-item" data-class-name="${esc(className)}">
          <span>
            <strong>${esc(className)}</strong>
            <span>${esc(meta?.parentType || "root")} · ${fieldCount} fields</span>
          </span>
          <span class="badge">新建</span>
        </button>
      `;
    }).join("");
  }

  function renderHeader() {
    const asset = getActiveAsset();
    if (!asset) {
      dom.activeTitle.textContent = "mod.json";
      dom.activePath.textContent = "项目清单";
      return;
    }
    dom.activeTitle.textContent = asset.fileName;
    dom.activePath.textContent = `${asset.path}${asset.classId != null ? ` · Class_Id ${asset.classId}` : ""}`;
  }

  function renderAssetConfig() {
    const asset = getActiveAsset();
    if (!asset) {
      dom.assetConfig.innerHTML = `
        <label><span>当前</span><input value="mod.json" disabled></label>
        <label><span>类型</span><input value="项目清单" disabled></label>
      `;
      return;
    }

    dom.assetConfig.innerHTML = `
      <label>
        <span>目录</span>
        <select data-asset-kind="true">${CONTENT_KINDS.map(([value, label]) =>
          `<option value="${esc(value)}" ${asset.kind === value ? "selected" : ""}>${esc(value)} · ${esc(label)}</option>`
        ).join("")}</select>
      </label>
      <label>
        <span>文件名</span>
        <input data-asset-file="true" value="${esc(asset.fileName)}" autocomplete="off">
      </label>
      <label>
        <span>类</span>
        <select data-asset-class="true">${classOptions(asset.root.className)}</select>
      </label>
      <label>
        <span>路径</span>
        <input value="${esc(asset.path)}" disabled>
      </label>
      <div class="asset-actions">
        <button type="button" class="btn danger" data-action="delete-asset">删除</button>
      </div>
    `;
  }

  function renderFieldSelect() {
    const asset = getActiveAsset();
    if (!asset) {
      dom.fieldSelect.innerHTML = `<option value="">请选择内容文件</option>`;
      dom.fieldSelect.disabled = true;
      return;
    }
    dom.fieldSelect.disabled = false;
    const existing = new Set(asset.root.fields.map((field) => field.name));
    const fields = getFields(asset.root.className).filter((field) => !existing.has(field.name));
    dom.fieldSelect.innerHTML = fields.length
      ? fields.map((field) => `<option value="${esc(field.name)}">${esc(field.name)} · ${esc(field.type)}</option>`).join("")
      : `<option value="">字段已全部添加</option>`;
  }

  function renderViewTabs() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === state.view);
    });
  }

  function renderEditor() {
    if (state.view === "json") {
      dom.editorBody.innerHTML = `<pre class="json-preview">${esc(JSON.stringify(getActiveJson(), null, 2))}</pre>`;
      return;
    }

    if (state.view === "backend") {
      dom.editorBody.innerHTML = `
        <div class="backend-tools">
          <button type="button" class="btn primary" data-action="export-from-backend">ExportClass</button>
          <button type="button" class="btn" data-action="get-selected-value">GetFieldValue</button>
        </div>
        <pre class="backend-preview">${esc(state.backendExport || "尚未从后端导出。")}</pre>
      `;
      return;
    }

    const asset = getActiveAsset();
    if (!asset) {
      renderManifestTable();
      return;
    }

    const rows = [];
    rows.push(renderObjectRow(asset.root, [], 0));
    asset.root.fields.forEach((field) => appendFieldRows(rows, field, asset.root, [field.name], 0));

    dom.editorBody.innerHTML = `
      <div class="field-table-wrap">
        <table class="field-table">
          <thead>
            <tr>
              <th>字段</th>
              <th>路径</th>
              <th>值</th>
              <th>默认</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    `;
  }

  function renderManifestTable() {
    const manifest = manifestJson();
    const rows = Object.entries(manifest).map(([key, value]) => `
      <tr class="${state.selectedId === "manifest" ? "is-selected" : ""}" data-select-id="manifest">
        <td class="field-name"><strong>${esc(key)}</strong><span>mod.json</span></td>
        <td class="path-cell">${esc(key)}</td>
        <td class="value-cell">${esc(value)}</td>
        <td></td>
        <td></td>
      </tr>
    `).join("");
    dom.editorBody.innerHTML = `
      <div class="field-table-wrap">
        <table class="field-table">
          <thead><tr><th>字段</th><th>路径</th><th>值</th><th>默认</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderObjectRow(classNode, path, depth) {
    return `
      <tr class="object-row ${state.selectedId === classNode.id ? "is-selected" : ""} indent-${Math.min(depth, 3)}" data-select-id="${esc(classNode.id)}">
        <td class="field-name">
          <strong>${esc(classNode.className)}</strong>
          <span>${depth === 0 ? "root object" : "nested object"}</span>
        </td>
        <td class="path-cell">${esc(path.join(" / ") || "(root)")}</td>
        <td class="value-cell"><span class="type-pill">object</span></td>
        <td></td>
        <td class="row-actions"></td>
      </tr>
    `;
  }

  function appendFieldRows(rows, field, owner, path, depth) {
    rows.push(renderFieldRow(field, owner, path, depth));
    if (field.child) {
      rows.push(renderObjectRow(field.child, path, depth + 1));
      field.child.fields.forEach((child) => appendFieldRows(rows, child, field.child, path.concat(child.name), depth + 1));
    }
    if (field.elements) {
      field.elements.forEach((element, index) => {
        const elementPath = path.concat(`#${index}`);
        rows.push(renderElementRow(element, field, index, elementPath, depth + 1));
        if (element.classNode) {
          rows.push(renderObjectRow(element.classNode, elementPath, depth + 2));
          element.classNode.fields.forEach((child) => appendFieldRows(rows, child, element.classNode, elementPath.concat(child.name), depth + 2));
        }
      });
    }
  }

  function renderFieldRow(field, owner, path, depth) {
    const selected = state.selectedId === field.id ? "is-selected" : "";
    return `
      <tr class="field-row ${selected} indent-${Math.min(depth, 3)}" data-select-id="${esc(field.id)}">
        <td class="field-name">
          <strong>${esc(field.name)}</strong>
          <span class="field-badges">
            <span class="type-pill">${esc(field.type)}</span>
            ${field.required ? `<span class="type-pill required-pill">required</span>` : ""}
          </span>
        </td>
        <td class="path-cell" title="${esc(path.join(" / "))}">${esc(path.join(" / "))}</td>
        <td class="value-cell">${renderValueEditor(field)}</td>
        <td class="path-cell">${esc(field.defaultValue || "")}</td>
        <td class="row-actions">${renderFieldActions(field)}</td>
      </tr>
    `;
  }

  function renderValueEditor(field) {
    if (field.child) return `<span class="type-pill">${esc(field.child.className)} object</span>`;
    if (field.elements) return `<span class="type-pill">${field.elements.length} elements</span>`;
    if (field.type === "Boolean") {
      return `<input type="checkbox" data-field-boolean="${esc(field.id)}" ${String(field.value).toLowerCase() === "true" ? "checked" : ""}>`;
    }
    if (field.type === "Color") {
      return `<input type="color" data-field-value="${esc(field.id)}" value="${esc(normalizeColor(field.value))}">`;
    }
    if (field.type === "String" && field.accepts.length) {
      return `<input data-field-value="${esc(field.id)}" value="${esc(field.value)}" list="contentNameHints" autocomplete="off">`;
    }
    return `<input data-field-value="${esc(field.id)}" value="${esc(field.value)}" autocomplete="off">`;
  }

  function renderFieldActions(field) {
    if (field.elements) {
      const options = elementClassOptions(field);
      return `
        <select id="elementType-${esc(field.id)}" class="inline-select">${options}</select>
        <button type="button" class="icon-btn accent" data-action="add-element-to-field" data-field-id="${esc(field.id)}" title="添加数组元素">+</button>
        <button type="button" class="icon-btn" data-action="reset-field" data-field-id="${esc(field.id)}" title="重置">↺</button>
        <button type="button" class="icon-btn danger" data-action="delete-field" data-field-id="${esc(field.id)}" title="删除字段">×</button>
      `;
    }
    if (isObjectLike(field)) {
      const options = objectClassOptions(field);
      return field.child
        ? `
          <button type="button" class="icon-btn" data-action="clear-object" data-field-id="${esc(field.id)}" title="清空对象">清</button>
          <button type="button" class="icon-btn" data-action="reset-field" data-field-id="${esc(field.id)}" title="重置">↺</button>
          <button type="button" class="icon-btn danger" data-action="delete-field" data-field-id="${esc(field.id)}" title="删除字段">×</button>
        `
        : `
          <select id="objectType-${esc(field.id)}" class="inline-select">${options}</select>
          <button type="button" class="icon-btn accent" data-action="create-object" data-field-id="${esc(field.id)}" title="创建对象">+</button>
          <button type="button" class="icon-btn" data-action="reset-field" data-field-id="${esc(field.id)}" title="重置">↺</button>
          <button type="button" class="icon-btn danger" data-action="delete-field" data-field-id="${esc(field.id)}" title="删除字段">×</button>
        `;
    }
    return `
      <button type="button" class="icon-btn" data-action="reset-field" data-field-id="${esc(field.id)}" title="重置">↺</button>
      <button type="button" class="icon-btn danger" data-action="delete-field" data-field-id="${esc(field.id)}" title="删除字段">×</button>
    `;
  }

  function renderElementRow(element, ownerField, index, path, depth) {
    const selected = state.selectedId === element.id ? "is-selected" : "";
    const value = element.classNode
      ? `<span class="type-pill">${esc(element.classNode.className)}</span>`
      : `<input data-element-value="${esc(element.id)}" value="${esc(element.value)}" autocomplete="off">`;
    return `
      <tr class="element-row ${selected} indent-${Math.min(depth, 3)}" data-select-id="${esc(element.id)}">
        <td class="field-name"><strong>#${index}</strong><span>${esc(ownerField.name)} element</span></td>
        <td class="path-cell">${esc(path.join(" / "))}</td>
        <td class="value-cell">${value}</td>
        <td></td>
        <td class="row-actions">
          <button type="button" class="icon-btn" data-action="move-element-up" data-element-id="${esc(element.id)}" title="上移">↑</button>
          <button type="button" class="icon-btn" data-action="move-element-down" data-element-id="${esc(element.id)}" title="下移">↓</button>
          <button type="button" class="icon-btn danger" data-action="delete-element" data-element-id="${esc(element.id)}" title="删除元素">×</button>
        </td>
      </tr>
    `;
  }

  function renderInspector() {
    const selection = getSelection();
    dom.selectionKind.textContent = selection?.kind || "none";
    if (!selection) {
      dom.inspectorBody.innerHTML = `<div class="empty-state"><strong>未选择</strong><span>点击表格行查看文档和字段信息。</span></div>`;
      return;
    }

    if (selection.kind === "manifest") {
      dom.inspectorBody.innerHTML = `
        <div class="doc-block">
          <div class="doc-card"><h3>mod.json</h3><p>项目清单会导出为模组根目录的 mod.json。</p></div>
          <div class="doc-card"><h3>文件数</h3><p>${state.project.assets.length} 个内容 JSON。</p></div>
        </div>
      `;
      return;
    }

    if (selection.kind === "class") {
      const meta = getType(selection.classNode.className);
      const available = getFields(selection.classNode.className)
        .filter((field) => !selection.classNode.fields.some((item) => item.name === field.name))
        .slice(0, 8);
      dom.inspectorBody.innerHTML = `
        <div class="doc-block">
          <div class="doc-card">
            <h3>${esc(selection.classNode.className)}</h3>
            <p>${esc(meta?.doc || "后端类。")}</p>
          </div>
          <div class="doc-card">
            <h3>可添加字段</h3>
            ${available.length ? available.map((field) => `
              <div class="field-option-line">
                <span>${esc(field.name)} · ${esc(field.type)}</span>
                <button type="button" class="icon-btn accent" data-action="add-field-from-inspector" data-field-name="${esc(field.name)}">+</button>
              </div>
            `).join("") : `<p>没有更多字段。</p>`}
          </div>
        </div>
      `;
      return;
    }

    if (selection.kind === "field") {
      const field = selection.field;
      loadFieldDetails(selection.owner.className, field.name);
      dom.inspectorBody.innerHTML = `
        <div class="doc-block">
          <div class="doc-card">
            <h3>${esc(field.name)}</h3>
            <p>${esc(field.doc || "暂无字段说明。")}</p>
          </div>
          <div class="doc-card">
            <h3>类型</h3>
            <p>${esc(field.type)}${field.required ? " · required" : ""}</p>
          </div>
          <div class="doc-card">
            <h3>默认值</h3>
            <p>${esc(field.defaultValue || "null")}</p>
          </div>
          <div class="doc-card">
            <h3>Field_Path</h3>
            <p>${esc(JSON.stringify(selection.path))}</p>
          </div>
        </div>
      `;
      return;
    }

    if (selection.kind === "element") {
      dom.inspectorBody.innerHTML = `
        <div class="doc-block">
          <div class="doc-card"><h3>数组元素 #${selection.index}</h3><p>${esc(selection.ownerField.name)} 的第 ${selection.index + 1} 个元素。</p></div>
          <div class="doc-card"><h3>Field_Path</h3><p>${esc(JSON.stringify(selection.path))}</p></div>
        </div>
      `;
    }
  }

  function renderPreview() {
    dom.livePreview.textContent = JSON.stringify(getActiveJson(), null, 2);
  }

  function renderFeedback() {
    const items = [...state.feedback, ...state.logs.slice(-6).reverse()];
    dom.problemCount.textContent = String(state.feedback.length);
    dom.feedbackList.innerHTML = items.length ? items.map((item) => `
      <div class="feedback-item ${esc(item.level || "info")}">
        <strong>${esc(item.level || "info")}</strong>
        <p>${esc(item.message)}</p>
      </div>
    `).join("") : `<div class="feedback-item ok"><strong>OK</strong><p>当前项目未发现明显问题。</p></div>`;
  }

  function selectAsset(assetId) {
    state.activeAssetId = assetId;
    const asset = getActiveAsset();
    state.selectedId = asset ? asset.root.id : "manifest";
    ensureFieldsForClass(asset?.root.className);
    renderAll();
  }

  function selectNode(id) {
    state.selectedId = id;
    renderEditor();
    renderInspector();
  }

  function openNewDialog(className) {
    const selectedClass = className || dom.newClassName.value || DEFAULT_CLASS_BY_KIND.blocks;
    populateClassSelect(dom.newClassName, selectedClass);
    const kind = kindForClass(selectedClass);
    dom.newKind.value = kind;
    dom.newContentForm.elements.fileName.value = uniqueFileName(kind, selectedClass);
    dom.newDialog.classList.remove("hidden");
  }

  function closeNewDialog() {
    dom.newDialog.classList.add("hidden");
  }

  function populateClassSelect(select, selected) {
    select.innerHTML = classOptions(selected);
    select.value = selected && getAllClasses().includes(selected) ? selected : select.options[0]?.value || "Block";
  }

  function classOptions(selected) {
    return getAllClasses().map((className) =>
      `<option value="${esc(className)}" ${className === selected ? "selected" : ""}>${esc(className)}</option>`
    ).join("");
  }

  function elementClassOptions(field) {
    const accepted = field.accepts.length ? field.accepts : [acceptedClass(field)].filter(Boolean);
    const classes = accepted.length ? accepted : getAllClasses();
    return classes.map((className) => `<option value="${esc(className)}">${esc(className)}</option>`).join("");
  }

  function objectClassOptions(field) {
    const classes = field.accepts.length ? field.accepts : [acceptedClass(field), "BulletType", "Weapon", "ItemStack"].filter(Boolean);
    return unique(classes).map((className) => `<option value="${esc(className)}">${esc(className)}</option>`).join("");
  }

  function loadFieldDetails(className, fieldName) {
    const key = `${className}.${fieldName}`;
    if (state.fieldDetails.has(key)) return;
    state.fieldDetails.set(key, true);
    Promise.all([
      callApi("FieldDoc", { Class_Name: className, Field_Name: fieldName }),
      callApi("FieldDefaultValue", { Class_Name: className, Field_Name: fieldName }),
    ]).then(([docReply, defaultReply]) => {
      const field = getField(className, fieldName);
      if (field) {
        if (docReply.Field_Doc) field.doc = docReply.Field_Doc;
        if (defaultReply.Default_Value && defaultReply.Default_Value !== "null") field.defaultValue = defaultReply.Default_Value;
      }
      const selection = getSelection();
      if (selection?.kind === "field" && selection.field.name === fieldName) renderInspector();
    }).catch(() => {});
  }

  function ensureFieldsForClass(className) {
    if (!className || state.fieldCache.has(className)) return Promise.resolve(getFields(className));
    return callApi("AllField", { Class_Name: className }).then((reply) => {
      const local = getFields(className);
      const byName = new Map(local.map((field) => [field.name, field]));
      (reply.Field_List || []).forEach((name) => {
        if (!byName.has(name)) byName.set(name, fieldDef(name, "String", "", "后端字段。"));
      });
      state.fieldCache.set(className, Array.from(byName.values()));
      renderFieldSelect();
      return state.fieldCache.get(className);
    }).catch(() => getFields(className));
  }

  function validateProject(showToast) {
    const problems = [];
    const manifest = state.project.manifest;
    if (!manifest.name) problems.push(problem("error", "mod.json 缺少 name"));
    if (manifest.name && !/^[a-z0-9._-]+$/.test(manifest.name)) {
      problems.push(problem("error", "mod.json name 只能使用小写字母、数字、点、下划线和短横线"));
    }
    if (!manifest.displayName) problems.push(problem("warning", "mod.json 建议填写 displayName"));

    const paths = new Set();
    state.project.assets.forEach((asset) => {
      if (paths.has(asset.path)) problems.push(problem("error", `${asset.path} 路径重复`));
      paths.add(asset.path);
      validateClass(asset.root, asset.path, problems);
    });

    state.feedback = problems;
    if (showToast) toast(problems.length ? `发现 ${problems.length} 个问题` : "检查通过", problems.length ? "warning" : "success");
    return problems;
  }

  function validateClass(classNode, scope, problems) {
    getFields(classNode.className).filter((field) => field.required).forEach((meta) => {
      const node = classNode.fields.find((field) => field.name === meta.name);
      if (!node) problems.push(problem("warning", `${scope} 建议填写 ${meta.name}`));
      else if (!node.child && !node.elements && String(node.value || "").trim() === "") {
        problems.push(problem("warning", `${scope} 的 ${node.name} 为空`));
      }
    });

    classNode.fields.forEach((field) => {
      if ((field.type === "Int" || field.type === "Float" || field.type === "Double") && Number.isNaN(Number(field.value))) {
        problems.push(problem("error", `${scope} 的 ${field.name} 需要是数字`));
      }
      if (field.child) validateClass(field.child, `${scope}/${field.name}`, problems);
      if (field.elements) {
        field.elements.forEach((element, index) => {
          if (element.classNode) validateClass(element.classNode, `${scope}/${field.name}#${index}`, problems);
        });
      }
    });
  }

  function problem(level, message) {
    return { level, message };
  }

  function getSelection() {
    if (state.selectedId === "manifest") return { kind: "manifest" };
    const asset = getActiveAsset();
    if (!asset) return null;
    return findInClass(asset.root, state.selectedId, [], null);
  }

  function findSelection(id) {
    if (id === "manifest") return { kind: "manifest" };
    const asset = getActiveAsset();
    return asset ? findInClass(asset.root, id, [], null) : null;
  }

  function findInClass(classNode, id, path, ownerField) {
    if (!classNode) return null;
    if (classNode.id === id) return { kind: "class", classNode, path, ownerField };
    for (const field of classNode.fields) {
      const fieldPath = path.concat(field.name);
      if (field.id === id) return { kind: "field", field, owner: classNode, path: fieldPath };
      if (field.child) {
        const child = findInClass(field.child, id, fieldPath, field);
        if (child) return child;
      }
      if (field.elements) {
        for (let index = 0; index < field.elements.length; index += 1) {
          const element = field.elements[index];
          const elementPath = fieldPath.concat(`#${index}`);
          if (element.id === id) return { kind: "element", element, ownerField: field, index, path: elementPath };
          if (element.classNode) {
            const child = findInClass(element.classNode, id, elementPath, field);
            if (child) return child;
          }
        }
      }
    }
    return null;
  }

  function getActiveAsset() {
    return state.project.assets.find((asset) => asset.id === state.activeAssetId) || null;
  }

  function getActiveJson() {
    const asset = getActiveAsset();
    return asset ? buildClassJson(asset.root) : manifestJson();
  }

  function manifestJson() {
    const manifest = state.project.manifest;
    return {
      name: manifest.name,
      displayName: manifest.displayName,
      author: manifest.author,
      version: manifest.version,
      minGameVersion: manifest.minGameVersion,
      description: manifest.description,
    };
  }

  function buildClassJson(classNode) {
    const result = { type: classNode.className };
    classNode.fields.forEach((field) => {
      result[field.name] = buildFieldValue(field);
    });
    return result;
  }

  function buildFieldValue(field) {
    if (field.child) return buildClassJson(field.child);
    if (field.elements) return field.elements.map((element) => element.classNode ? buildClassJson(element.classNode) : coerceValue(element.value, elementType(field.type)));
    return coerceValue(field.value, field.type);
  }

  function coerceValue(value, type) {
    const text = String(value ?? "").trim();
    if (type === "Boolean") return text.toLowerCase() === "true";
    if (type === "Int") return Number.parseInt(text || "0", 10) || 0;
    if (type === "Float" || type === "Double") return Number.parseFloat(text || "0") || 0;
    if (type === "Object") {
      try {
        return JSON.parse(text || "{}");
      } catch (_) {
        return {};
      }
    }
    return text;
  }

  function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const asset = importAssetJson(data, file.name);
        state.project.assets.push(asset);
        selectAsset(asset.id);
        toast("JSON 已导入", "success");
      } catch (error) {
        toast(`导入失败：${error.message}`, "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function importAssetJson(data, fileName) {
    const className = data.type || "Block";
    const asset = createAsset(fileName.replace(/\.json$/i, ""), kindForClass(className), className);
    asset.root = buildClassFromJson(data, className, asset.fileName);
    asset.className = asset.root.className;
    updateAssetPath(asset);
    return asset;
  }

  function buildClassFromJson(data, fallbackClass, instanceName) {
    const className = data.type || fallbackClass || "Block";
    const classNode = createClassNode(className, instanceName || className);
    Object.entries(data).forEach(([key, value]) => {
      if (key === "type") return;
      const meta = getField(className, key) || fieldDef(key, inferType(value), stringifyValue(value), "导入字段。");
      const field = createField(meta, "");
      applyImportedValue(field, value);
      classNode.fields.push(field);
    });
    return classNode;
  }

  function applyImportedValue(field, value) {
    if (Array.isArray(value)) {
      field.elements = value.map((item) => {
        if (item && typeof item === "object") {
          const className = item.type || acceptedClass(field) || "ItemStack";
          return { id: uid("element"), kind: "element", value: "", classNode: buildClassFromJson(item, className, className) };
        }
        return createElement(String(item ?? ""), "");
      });
      field.value = "";
      return;
    }

    if (value && typeof value === "object") {
      const className = value.type || acceptedClass(field);
      if (className) {
        field.child = buildClassFromJson(value, className, className);
        field.value = "";
      } else {
        field.value = JSON.stringify(value, null, 2);
      }
      return;
    }

    field.value = String(value ?? "");
  }

  function saveProject(showToast) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    if (showToast) toast("项目已保存到浏览器", "success");
  }

  function loadProject() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function hydrateProject(project) {
    project.version ||= 2;
    project.manifest ||= createStarterProject().manifest;
    project.assets ||= [];
    project.assets.forEach((asset) => {
      asset.id ||= uid("asset");
      asset.kind ||= kindForClass(asset.className || asset.root?.className || "Block");
      asset.fileName = slugify(asset.fileName || asset.name || "content");
      asset.root ||= createClassNode(asset.className || DEFAULT_CLASS_BY_KIND[asset.kind] || "Block", asset.fileName);
      hydrateClass(asset.root);
      asset.className = asset.root.className;
      updateAssetPath(asset);
    });
  }

  function hydrateClass(classNode) {
    classNode.id ||= uid("class");
    classNode.kind = "class";
    classNode.fields ||= [];
    classNode.fields.forEach((field) => {
      field.id ||= uid("field");
      field.kind = "field";
      field.accepts ||= getField(classNode.className, field.name)?.accepts || [];
      field.doc ||= getField(classNode.className, field.name)?.doc || "";
      field.defaultValue ??= getField(classNode.className, field.name)?.defaultValue || "";
      field.required ||= Boolean(getField(classNode.className, field.name)?.required);
      if (field.child) hydrateClass(field.child);
      if (field.elements) {
        field.elements.forEach((element) => {
          element.id ||= uid("element");
          element.kind = "element";
          if (element.classNode) hydrateClass(element.classNode);
        });
      } else if (isArrayType(field.type)) {
        field.elements = [];
      }
    });
  }

  function downloadCurrentJson() {
    const asset = getActiveAsset();
    const name = asset ? `${asset.fileName}.json` : "mod.json";
    download(name, JSON.stringify(getActiveJson(), null, 2), "application/json");
  }

  function copyCurrentJson() {
    const text = JSON.stringify(getActiveJson(), null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast("JSON 已复制", "success"));
    } else {
      toast("当前浏览器不支持剪贴板 API", "warning");
    }
  }

  function download(name, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getAllClasses() {
    return unique([...(state.classes || []), ...getLocalClasses()]).sort(compareText);
  }

  function getLocalClasses() {
    return LOCAL_TYPES.map((item) => item.name);
  }

  function getType(className) {
    return LOCAL_TYPES.find((item) => item.name === className) || null;
  }

  function getFields(className) {
    if (state.fieldCache.has(className)) return state.fieldCache.get(className);
    const names = [];
    const fields = [];
    typeChain(className).forEach((typeName) => {
      (LOCAL_FIELDS[typeName] || []).forEach((field) => {
        if (!names.includes(field.name)) {
          names.push(field.name);
          fields.push(field);
        }
      });
    });
    return fields;
  }

  function getField(className, fieldName) {
    return getFields(className).find((field) => field.name === fieldName) || null;
  }

  function typeChain(className) {
    const chain = [];
    const seen = new Set();
    let current = getType(className);
    while (current && !seen.has(current.name)) {
      chain.unshift(current.name);
      seen.add(current.name);
      current = current.parentType ? getType(current.parentType) : null;
    }
    if (!chain.includes(className)) chain.push(className);
    return chain;
  }

  function defaultFieldValue(meta) {
    if (meta.defaultValue != null && meta.defaultValue !== "") return meta.defaultValue;
    return defaultValueByType(meta.type);
  }

  function defaultValueByType(type) {
    if (type === "Boolean") return "false";
    if (type === "Int" || type === "Float" || type === "Double") return "0";
    if (type === "Color") return "#ffffff";
    if (type === "Object") return "{}";
    return "";
  }

  function isArrayType(type) {
    return /^Array|^Seq|^List/.test(String(type || ""));
  }

  function isObjectLike(field) {
    return field.type === "Object" || getLocalClasses().includes(field.type);
  }

  function acceptedClass(field) {
    if (field.accepts?.length) return field.accepts[0];
    if (field.type === "Array<ItemStack>") return "ItemStack";
    if (field.type === "Array<Weapon>") return "Weapon";
    if (field.type === "Object") return "BulletType";
    if (getLocalClasses().includes(field.type)) return field.type;
    return "";
  }

  function elementType(type) {
    const match = String(type || "").match(/<([^>]+)>/);
    return match ? match[1] : "String";
  }

  function kindForClass(className) {
    return KIND_BY_CLASS[className] || "blocks";
  }

  function kindShort(kind) {
    const map = { blocks: "B", items: "I", liquids: "L", units: "U", "status-effects": "S", weathers: "W", planets: "P" };
    return map[kind] || "C";
  }

  function updateAssetPath(asset) {
    asset.fileName = slugify(asset.fileName);
    asset.path = `content/${asset.kind}/${asset.fileName}.json`;
  }

  function uniqueFileName(kind, className) {
    const base = slugify(className || "content");
    let candidate = base;
    let index = 2;
    while (state.project?.assets?.some((asset) => asset.kind === kind && asset.fileName === candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function normalizeColor(value) {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : "#ffffff";
  }

  function inferType(value) {
    if (typeof value === "boolean") return "Boolean";
    if (typeof value === "number") return Number.isInteger(value) ? "Int" : "Float";
    if (Array.isArray(value)) return "Array<Object>";
    if (value && typeof value === "object") return "Object";
    return "String";
  }

  function stringifyValue(value) {
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value ?? "");
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\.json$/i, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "content";
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function compareText(a, b) {
    return String(a).localeCompare(String(b), "en");
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function addLog(level, message) {
    state.logs.push({ level, message });
    if (state.logs.length > 80) state.logs.shift();
    renderFeedback();
  }

  function toast(message, level) {
    const node = document.createElement("div");
    node.className = `toast ${level || "success"}`;
    node.innerHTML = `<span>${esc(message)}</span><button type="button" class="icon-btn">×</button>`;
    node.querySelector("button").addEventListener("click", () => node.remove());
    dom.toastRegion.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }

  function showApiError(error) {
    addLog("error", error.message);
    toast(error.message, "error");
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
