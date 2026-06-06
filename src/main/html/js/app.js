(function () {
  if (window.MindustryVisualEditorLoaded) return;
  window.MindustryVisualEditorLoaded = true;

  const KIND_DEFAULT_CLASS = {
    blocks: "Wall",
    items: "Item",
    liquids: "Liquid",
    units: "UnitType",
    "status-effects": "StatusEffect",
    weathers: "Weather",
    planets: "Planet",
  };

  const TYPE_CATALOG = [
    { name: "Block", parentType: "UnlockableContent", doc: "所有方块 JSON 的基础类型。" },
    { name: "Wall", parentType: "Block", doc: "防御墙体，适合演示生命值、尺寸、材料消耗。" },
    { name: "Drill", parentType: "Block", doc: "采矿方块，包含采矿速度、矿物层级和液体增强。" },
    { name: "Conveyor", parentType: "Block", doc: "运输带，包含速度、容量和桥接行为。" },
    { name: "Turret", parentType: "Block", doc: "炮塔，包含弹药、射程、装填和目标规则。" },
    { name: "Item", parentType: "UnlockableContent", doc: "物品定义，可被消耗、运输和作为建造材料。" },
    { name: "Liquid", parentType: "UnlockableContent", doc: "液体定义，支持颜色、热量和易燃性。" },
    { name: "UnitType", parentType: "UnlockableContent", doc: "单位类型，包含移动、生命值、武器和 AI 行为。" },
    { name: "StatusEffect", parentType: "UnlockableContent", doc: "状态效果，影响单位属性、伤害和视觉效果。" },
    { name: "Weather", parentType: "Content", doc: "天气效果，控制地图上的环境变化。" },
    { name: "Planet", parentType: "Content", doc: "星球定义，包含科技树、地图生成和可见性。" },
  ];

  const FIELD_CATALOG = {
    Block: [
      field("name", "String", "sample-block", "内容内部名称，建议和文件名保持一致。", true),
      field("localizedName", "String", "Sample Block", "游戏内显示名称。"),
      field("description", "String", "", "详情面板中的说明文本。"),
      field("size", "Int", "1", "方块占用格数。", true),
      field("health", "Int", "120", "方块生命值。"),
      field("requirements", "Array<ItemStack>", "copper/20", "建造消耗，格式示例 copper/20, lead/15。"),
      field("category", "String", "defense", "建造菜单分类。"),
      field("research", "String", "", "科技树前置研究内容。"),
      field("alwaysUnlocked", "Boolean", "false", "是否默认解锁。"),
    ],
    Wall: [
      field("armor", "Float", "0", "额外护甲值。"),
      field("absorbLasers", "Boolean", "false", "是否吸收激光。"),
      field("insulated", "Boolean", "false", "是否隔绝电弧。"),
      field("flashHit", "Boolean", "true", "被击中时是否闪烁。"),
    ],
    Drill: [
      field("drillTime", "Float", "280", "采矿一次需要的时间。", true),
      field("tier", "Int", "2", "可采矿物层级。"),
      field("warmupSpeed", "Float", "0.02", "启动速度。"),
      field("liquidBoostIntensity", "Float", "1.6", "液体增强倍率。"),
      field("drawMineItem", "Boolean", "true", "是否绘制正在采集的矿物。"),
    ],
    Conveyor: [
      field("speed", "Float", "0.08", "运输速度。", true),
      field("displayedSpeed", "Float", "8", "UI 中显示的速度。"),
      field("junctionReplacement", "String", "", "自动替换的交叉运输方块。"),
      field("bridgeReplacement", "String", "", "自动替换的桥接方块。"),
    ],
    Turret: [
      field("range", "Float", "160", "攻击范围。", true),
      field("reload", "Float", "45", "装填时间。"),
      field("ammoTypes", "Object", "{}", "弹药类型映射。"),
      field("targetAir", "Boolean", "true", "是否攻击空中目标。"),
      field("targetGround", "Boolean", "true", "是否攻击地面目标。"),
    ],
    Item: [
      field("name", "String", "sample-item", "物品内部名称。", true),
      field("localizedName", "String", "Sample Item", "游戏内显示名称。"),
      field("description", "String", "", "物品说明。"),
      field("color", "Color", "#8fc7ff", "物品颜色。"),
      field("cost", "Float", "1", "建造成本系数。"),
      field("hardness", "Int", "1", "矿物硬度。"),
      field("radioactivity", "Float", "0", "放射性。"),
      field("explosiveness", "Float", "0", "爆炸性。"),
      field("flammability", "Float", "0", "易燃性。"),
    ],
    Liquid: [
      field("name", "String", "sample-liquid", "液体内部名称。", true),
      field("localizedName", "String", "Sample Liquid", "游戏内显示名称。"),
      field("description", "String", "", "液体说明。"),
      field("color", "Color", "#65d5ff", "液体颜色。"),
      field("heatCapacity", "Float", "0.5", "热容量。"),
      field("flammability", "Float", "0", "易燃性。"),
      field("temperature", "Float", "0.5", "温度。"),
      field("viscosity", "Float", "0.5", "粘度。"),
    ],
    UnitType: [
      field("name", "String", "sample-unit", "单位内部名称。", true),
      field("localizedName", "String", "Sample Unit", "游戏内显示名称。"),
      field("description", "String", "", "单位说明。"),
      field("health", "Int", "360", "单位生命值。", true),
      field("speed", "Float", "1.2", "移动速度。"),
      field("flying", "Boolean", "false", "是否为飞行单位。"),
      field("weapons", "Array<Object>", "", "武器列表。"),
      field("research", "String", "", "科技树前置研究内容。"),
    ],
    StatusEffect: [
      field("name", "String", "sample-effect", "状态效果内部名称。", true),
      field("localizedName", "String", "Sample Effect", "游戏内显示名称。"),
      field("description", "String", "", "状态说明。"),
      field("color", "Color", "#f2b95f", "状态颜色。"),
      field("damage", "Float", "0", "每帧伤害。"),
      field("speedMultiplier", "Float", "1", "速度倍率。"),
      field("healthMultiplier", "Float", "1", "生命倍率。"),
      field("reloadMultiplier", "Float", "1", "装填倍率。"),
    ],
    Weather: [
      field("name", "String", "sample-weather", "天气内部名称。", true),
      field("localizedName", "String", "Sample Weather", "游戏内显示名称。"),
      field("duration", "Float", "600", "持续时间。"),
      field("opacityMultiplier", "Float", "0.5", "视觉透明度倍率。"),
      field("sound", "String", "", "天气音效。"),
    ],
    Planet: [
      field("name", "String", "sample-planet", "星球内部名称。", true),
      field("localizedName", "String", "Sample Planet", "游戏内显示名称。"),
      field("description", "String", "", "星球说明。"),
      field("radius", "Float", "1", "星球半径。"),
      field("visible", "Boolean", "true", "是否在星图可见。"),
      field("sectorSeed", "Int", "1", "区块生成种子。"),
    ],
  };

  const state = {
    api: null,
    project: null,
    activeFileId: "manifest",
    selectedNodeId: null,
    classes: [],
    fieldSearch: "",
    dockTab: "json",
    canvasMode: "select",
    zoom: 1,
    logs: [],
    problems: [],
    packageJob: null,
    drag: null,
  };

  class BackendBridge {
    constructor() {
      this.mode = "mock";
      this.socket = null;
      this.url = "";
    }

    connect(url) {
      this.url = url;
      return new Promise((resolve, reject) => {
        if (!("WebSocket" in window)) {
          reject(new Error("当前浏览器不支持 WebSocket"));
          return;
        }

        const socket = new WebSocket(url);
        const timeout = window.setTimeout(() => {
          socket.close();
          reject(new Error("连接超时，继续使用 Mock API"));
        }, 1200);

        socket.addEventListener("open", () => {
          window.clearTimeout(timeout);
          this.socket = socket;
          this.mode = "ws";
          resolve();
        });

        socket.addEventListener("message", (event) => {
          addLog("ws", `收到后端消息：${String(event.data).slice(0, 180)}`);
        });

        socket.addEventListener("close", () => {
          if (this.mode === "ws") {
            addLog("ws", "后端连接已断开，已回退到 Mock API");
          }
          this.mode = "mock";
          this.socket = null;
          renderConnectionStatus();
        });

        socket.addEventListener("error", () => {
          window.clearTimeout(timeout);
          reject(new Error("无法连接后端，继续使用 Mock API"));
        });
      });
    }

    request(wsType, payload) {
      if (this.mode === "ws" && this.socket && this.socket.readyState === WebSocket.OPEN) {
        const content = JSON.stringify(payload || {});
        this.socket.send(JSON.stringify({ wsType, content, out: false, dataList: {} }));
      }
      return mockRequest(wsType, payload || {});
    }
  }

  function field(name, type, defaultValue, notes, required) {
    return {
      name,
      type,
      defaultValue,
      notes,
      required: Boolean(required),
    };
  }

  function mockRequest(wsType, payload) {
    switch (wsType) {
      case "Init":
        return Promise.resolve({ Success: true, Doc_Count: TYPE_CATALOG.length, Message: "Mock docs loaded" });
      case "AllClass":
        return Promise.resolve({ Class_List: TYPE_CATALOG.map((item) => item.name) });
      case "AllField":
        return Promise.resolve({ Field_List: getFieldsForClass(payload.Class_Name).map((item) => item.name) });
      case "GetClassDoc": {
        const meta = TYPE_CATALOG.find((item) => item.name === payload.Class_Name);
        return Promise.resolve({ Doc: meta ? meta.doc : "" });
      }
      case "GetFieldDoc": {
        const meta = getFieldsForClass(payload.Class_Name).find((item) => item.name === payload.Field_Name);
        return Promise.resolve({ Doc: meta ? meta.notes : "" });
      }
      case "NewClass":
        return Promise.resolve({ Class_Id: Date.now() % 100000 });
      case "RemoveClass":
        return Promise.resolve({ Success: true });
      case "SaveProject":
        return Promise.resolve({ Success: true });
      case "PackageMod":
        return Promise.resolve({ Success: true, Message: "Mock package job completed" });
      default:
        return Promise.resolve({});
    }
  }

  function boot() {
    state.api = new BackendBridge();
    bindEvents();
    createProject({
      name: "visual-json-mod",
      displayName: "Visual JSON Mod",
      author: "MindustryMIT",
      version: "1.0.0",
      minGameVersion: "146",
      description: "Created with the MindustryMIT visual JSON editor.",
      starterKind: "blocks",
    });

    state.api.request("Init", { Data_Dir: "mock" }).then((result) => {
      addLog("api", `初始化完成：${result.Message}，类型文档 ${result.Doc_Count} 个`);
      return state.api.request("AllClass", {});
    }).then((result) => {
      state.classes = result.Class_List || TYPE_CATALOG.map((item) => item.name);
      renderAll();
    });
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleChange);
    document.addEventListener("submit", handleSubmit);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopDrag);

    document.getElementById("nodeLayer").addEventListener("mousedown", (event) => {
      const node = event.target.closest(".node");
      const header = event.target.closest(".node-header");
      if (!node || !header) return;
      const file = getActiveFile();
      const nodeData = file && file.nodes.find((item) => item.id === node.dataset.nodeId);
      if (!nodeData) return;
      state.selectedNodeId = nodeData.id;
      state.drag = {
        nodeId: nodeData.id,
        startX: event.clientX,
        startY: event.clientY,
        x: nodeData.x,
        y: nodeData.y,
      };
      renderInspector();
      renderCanvas();
      event.preventDefault();
    });

    document.getElementById("projectFileInput").addEventListener("change", handleProjectFile);
  }

  function handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      runAction(actionTarget.dataset.action, actionTarget);
      return;
    }

    const tabTarget = event.target.closest("[data-dock-tab]");
    if (tabTarget) {
      state.dockTab = tabTarget.dataset.dockTab;
      renderDock();
      renderDockTabs();
      return;
    }

    const modeTarget = event.target.closest("[data-canvas-mode]");
    if (modeTarget) {
      state.canvasMode = modeTarget.dataset.canvasMode;
      renderCanvasMode();
      return;
    }

    const fileTarget = event.target.closest("[data-file-id]");
    if (fileTarget) {
      state.activeFileId = fileTarget.dataset.fileId;
      state.selectedNodeId = getActiveFile()?.nodes[0]?.id || null;
      renderAll();
      return;
    }

    const fieldTarget = event.target.closest("[data-field-name]");
    if (fieldTarget) {
      addFieldToActive(fieldTarget.dataset.fieldName);
      return;
    }

    const nodeTarget = event.target.closest(".node");
    if (nodeTarget) {
      state.selectedNodeId = nodeTarget.dataset.nodeId;
      renderCanvas();
      renderInspector();
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.id === "fieldSearch") {
      state.fieldSearch = target.value;
      renderFieldPalette();
      return;
    }

    const manifestKey = target.dataset.manifest;
    if (manifestKey && state.project) {
      state.project.manifest[manifestKey] = target.value;
      state.project.updatedAt = new Date().toISOString();
      renderProjectSummary();
      renderDock();
      return;
    }

    const fileProp = target.dataset.fileProp;
    if (fileProp) {
      const file = getActiveFile();
      if (!file) return;
      file[fileProp] = target.value;
      if (fileProp === "name") {
        file.path = `content/${file.kind}/${slugify(target.value)}.json`;
      }
      file.updatedAt = new Date().toISOString();
      renderTree();
      renderCanvas();
      renderDock();
      return;
    }

    const fieldValue = target.dataset.fieldValue;
    if (fieldValue) {
      const node = getSelectedNode();
      if (!node) return;
      node.value = target.value;
      renderCanvas();
      renderDock();
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.id === "contentKind") {
      const picker = document.getElementById("classPicker");
      picker.value = KIND_DEFAULT_CLASS[target.value] || "Block";
      return;
    }

    const fileClass = target.dataset.fileClass;
    if (fileClass) {
      const file = getActiveFile();
      if (!file) return;
      file.className = target.value;
      const root = file.nodes.find((item) => item.kind === "root");
      if (root) {
        root.className = target.value;
        root.title = target.value;
      }
      file.nodes = file.nodes.filter((item) => item.kind === "root");
      addRequiredFields(file);
      state.selectedNodeId = root ? root.id : null;
      addLog("edit", `已切换 ${file.name}.json 类型为 ${target.value}`);
      renderAll();
      return;
    }

    const fileProp = target.dataset.fileProp;
    if (fileProp) {
      const file = getActiveFile();
      if (!file) return;
      file[fileProp] = target.value;
      if (fileProp === "kind") {
        file.path = `content/${file.kind}/${slugify(file.name)}.json`;
      }
      file.updatedAt = new Date().toISOString();
      renderTree();
      renderDock();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "projectForm") {
      event.preventDefault();
      const formData = new FormData(event.target);
      createProject(Object.fromEntries(formData.entries()));
      closeProjectModal();
      renderAll();
      addLog("project", "已创建新项目");
      return;
    }

    if (event.target.id === "connectionForm") {
      event.preventDefault();
      const url = document.getElementById("wsUrl").value.trim();
      addLog("ws", `尝试连接 ${url}`);
      state.api.connect(url).then(() => {
        addLog("ws", "后端 WebSocket 已连接，当前仍保留 Mock 数据兜底");
        renderConnectionStatus();
      }).catch((error) => {
        addLog("ws", error.message);
        renderConnectionStatus();
      });
    }
  }

  function handleProjectFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.project && data.project.manifest && Array.isArray(data.project.files)) {
          state.project = data.project;
          state.activeFileId = state.project.files[0]?.id || "manifest";
          state.selectedNodeId = getActiveFile()?.nodes[0]?.id || null;
          addLog("project", `已打开项目快照：${file.name}`);
        } else {
          importJsonAsContent(data, file.name);
        }
        renderAll();
      } catch (error) {
        addLog("error", `打开失败：${error.message}`);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function runAction(action, target) {
    switch (action) {
      case "new-project":
        openProjectModal();
        break;
      case "close-project-modal":
        closeProjectModal();
        break;
      case "edit-manifest":
        state.activeFileId = "manifest";
        state.selectedNodeId = null;
        renderAll();
        break;
      case "open-project":
        document.getElementById("projectFileInput").click();
        break;
      case "save-project":
        saveProject();
        break;
      case "validate-project":
        validateProject();
        state.dockTab = "problems";
        renderAll();
        break;
      case "package-project":
        packageProject();
        break;
      case "zoom-in":
        state.zoom = Math.min(1.7, state.zoom + 0.1);
        renderCanvas();
        break;
      case "zoom-out":
        state.zoom = Math.max(0.6, state.zoom - 0.1);
        renderCanvas();
        break;
      case "fit-canvas":
        state.zoom = 1;
        document.getElementById("canvasViewport").scrollTo({ left: 80, top: 60, behavior: "smooth" });
        renderCanvas();
        break;
      case "delete-node":
        deleteSelectedNode();
        break;
      case "delete-file":
        deleteActiveFile();
        break;
      case "toggle-field-boolean":
        toggleSelectedBoolean();
        break;
      case "download-json":
        downloadCurrentJson();
        break;
      case "download-snapshot":
        downloadProjectSnapshot();
        break;
      case "download-package-plan":
        downloadPackagePlan();
        break;
      case "add-content-kind":
        createContentFromPicker();
        break;
      default:
        if (target && target.id === "addContentButton") {
          createContentFromPicker();
        }
    }
  }

  function handleMouseMove(event) {
    if (!state.drag) return;
    const file = getActiveFile();
    if (!file) return;
    const node = file.nodes.find((item) => item.id === state.drag.nodeId);
    if (!node) return;
    node.x = Math.max(24, state.drag.x + (event.clientX - state.drag.startX) / state.zoom);
    node.y = Math.max(24, state.drag.y + (event.clientY - state.drag.startY) / state.zoom);
    renderCanvas();
  }

  function stopDrag() {
    state.drag = null;
  }

  function createProject(data) {
    const starterKind = data.starterKind || "blocks";
    state.project = {
      id: uid("project"),
      manifest: {
        name: slugify(data.name || "visual-json-mod"),
        displayName: data.displayName || "Visual JSON Mod",
        author: data.author || "",
        version: data.version || "1.0.0",
        minGameVersion: data.minGameVersion || "146",
        description: data.description || "",
      },
      files: [],
      assets: {
        sprites: [],
        sounds: [],
        bundles: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const firstFile = createContentFile(starterKind, KIND_DEFAULT_CLASS[starterKind] || "Block", data.name || "sample-block");
    state.activeFileId = firstFile.id;
    state.selectedNodeId = firstFile.nodes[0].id;
    validateProject();
  }

  function createContentFromPicker() {
    const kind = document.getElementById("contentKind").value;
    const className = document.getElementById("classPicker").value || KIND_DEFAULT_CLASS[kind] || "Block";
    const file = createContentFile(kind, className, `${state.project.manifest.name}-${kind.slice(0, -1) || kind}`);
    state.activeFileId = file.id;
    state.selectedNodeId = file.nodes[0].id;
    addLog("project", `新增 ${file.path}`);
    renderAll();
  }

  function createContentFile(kind, className, baseName) {
    const safeName = uniqueFileName(kind, slugify(baseName || className));
    const rootId = uid("node");
    const file = {
      id: uid("file"),
      kind,
      name: safeName.replace(/\.json$/, ""),
      className,
      path: `content/${kind}/${safeName.replace(/\.json$/, "")}.json`,
      nodes: [
        {
          id: rootId,
          kind: "root",
          title: className,
          className,
          x: 120,
          y: 120,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.project.files.push(file);
    addRequiredFields(file);
    return file;
  }

  function addRequiredFields(file) {
    getFieldsForClass(file.className)
      .filter((item) => item.required)
      .slice(0, 4)
      .forEach((item) => addFieldNode(file, item, false));
  }

  function addFieldToActive(fieldName) {
    const file = getActiveFile();
    if (!file) return;
    const existing = file.nodes.find((item) => item.kind === "field" && item.fieldName === fieldName);
    if (existing) {
      state.selectedNodeId = existing.id;
      renderCanvas();
      renderInspector();
      return;
    }

    const meta = getFieldsForClass(file.className).find((item) => item.name === fieldName);
    if (!meta) return;
    const node = addFieldNode(file, meta, true);
    state.selectedNodeId = node.id;
    file.updatedAt = new Date().toISOString();
    addLog("edit", `已添加字段 ${fieldName}`);
    renderAll();
  }

  function addFieldNode(file, meta, stagger) {
    const root = file.nodes.find((item) => item.kind === "root");
    const index = file.nodes.filter((item) => item.kind === "field").length;
    const value = defaultValueForField(meta, file);
    const node = {
      id: uid("node"),
      kind: "field",
      parentId: root.id,
      fieldName: meta.name,
      type: meta.type,
      required: meta.required,
      doc: meta.notes,
      value,
      x: 490 + (stagger ? Math.min(index, 2) * 14 : 0),
      y: 104 + index * 118,
    };
    file.nodes.push(node);
    return node;
  }

  function defaultValueForField(meta, file) {
    if (meta.name === "name") return file.name;
    if (meta.name === "localizedName") return toTitle(file.name);
    return meta.defaultValue || "";
  }

  function getFieldsForClass(className) {
    const inherited = [];
    const type = TYPE_CATALOG.find((item) => item.name === className);
    if (type && type.parentType && FIELD_CATALOG[type.parentType]) {
      inherited.push(...FIELD_CATALOG[type.parentType]);
    }
    if (className !== "Block" && FIELD_CATALOG.Block && ["Wall", "Drill", "Conveyor", "Turret"].includes(className)) {
      inherited.unshift(...FIELD_CATALOG.Block);
    }
    const own = FIELD_CATALOG[className] || [];
    const merged = [...inherited, ...own];
    const seen = new Set();
    return merged.filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  }

  function renderAll() {
    renderConnectionStatus();
    renderProjectSummary();
    renderClassPicker();
    renderTree();
    renderFieldPalette();
    renderCanvas();
    renderInspector();
    renderDockTabs();
    renderDock();
  }

  function renderConnectionStatus() {
    const label = document.getElementById("connectionStatus");
    if (!state.api || state.api.mode === "mock") {
      label.textContent = "Mock API 就绪，等待 Java WS 接口";
    } else {
      label.textContent = `已连接 ${state.api.url}`;
    }
  }

  function renderProjectSummary() {
    const subtitle = document.getElementById("projectSubtitle");
    if (!state.project) {
      subtitle.textContent = "未加载";
      return;
    }
    const manifest = state.project.manifest;
    subtitle.textContent = `${manifest.displayName} / ${state.project.files.length} 个 JSON`;
  }

  function renderClassPicker() {
    const picker = document.getElementById("classPicker");
    const selected = picker.value || "Wall";
    const classes = state.classes.length ? state.classes : TYPE_CATALOG.map((item) => item.name);
    picker.innerHTML = classes
      .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
      .join("");
    picker.value = classes.includes(selected) ? selected : "Wall";
  }

  function renderTree() {
    const tree = document.getElementById("resourceTree");
    if (!state.project) {
      tree.innerHTML = "";
      return;
    }

    const groups = [
      ["config", [{ id: "manifest", title: "mod.json", meta: "manifest" }]],
      ...Object.keys(KIND_DEFAULT_CLASS).map((kind) => [
        `content/${kind}`,
        state.project.files
          .filter((file) => file.kind === kind)
          .map((file) => ({ id: file.id, title: `${file.name}.json`, meta: file.className })),
      ]),
      ["assets/sprites", []],
      ["assets/sounds", []],
      ["bundles", []],
    ];

    tree.innerHTML = groups.map(([title, files]) => `
      <div class="tree-folder">
        <div class="tree-folder-header">
          <span>${escapeHtml(title)}</span>
          <span>${files.length}</span>
        </div>
        <div class="tree-items">
          ${files.length ? files.map((file) => `
            <button type="button" class="tree-item ${state.activeFileId === file.id ? "is-active" : ""}" data-file-id="${escapeHtml(file.id)}">
              <span class="tree-icon">${file.id === "manifest" ? "M" : "J"}</span>
              <span class="tree-title">${escapeHtml(file.title)}</span>
              <span class="tree-meta">${escapeHtml(file.meta)}</span>
            </button>
          `).join("") : `<div class="tree-item"><span class="tree-icon">-</span><span class="tree-title">空</span><span class="tree-meta">待添加</span></div>`}
        </div>
      </div>
    `).join("");
  }

  function renderFieldPalette() {
    const palette = document.getElementById("fieldPalette");
    const count = document.getElementById("fieldCount");
    const file = getActiveFile();
    if (!file) {
      count.textContent = "0";
      palette.innerHTML = `<div class="field-card"><div><strong>选择 JSON 文件</strong><small>字段库会按当前类型显示</small></div></div>`;
      return;
    }

    const used = new Set(file.nodes.filter((item) => item.kind === "field").map((item) => item.fieldName));
    const fields = getFieldsForClass(file.className)
      .filter((item) => {
        const needle = `${item.name} ${item.type} ${item.notes}`.toLowerCase();
        return needle.includes(state.fieldSearch.trim().toLowerCase());
      });

    count.textContent = String(fields.length);
    palette.innerHTML = fields.map((item) => `
      <div class="field-card">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.type)}${item.required ? " / required" : ""}</small>
        </div>
        <button type="button" class="icon-button ${used.has(item.name) ? "" : "accent"}" data-field-name="${escapeHtml(item.name)}" title="添加字段">
          ${used.has(item.name) ? "go" : "+"}
        </button>
      </div>
    `).join("");
  }

  function renderCanvas() {
    const world = document.getElementById("canvasWorld");
    const layer = document.getElementById("nodeLayer");
    const wireLayer = document.getElementById("wireLayer");
    world.style.transform = `scale(${state.zoom})`;
    document.getElementById("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;

    const file = getActiveFile();
    if (!file) {
      layer.innerHTML = `
        <div class="empty-canvas">
          <strong>mod.json</strong>
          这里编辑项目清单。选择左侧 content 文件后会显示可视化 JSON 节点。
        </div>
      `;
      wireLayer.innerHTML = "";
      return;
    }

    layer.innerHTML = file.nodes.map((node) => renderNode(file, node)).join("");
    renderWires(file);
  }

  function renderNode(file, node) {
    const selected = node.id === state.selectedNodeId ? "is-selected" : "";
    if (node.kind === "root") {
      const fieldCount = file.nodes.filter((item) => item.kind === "field").length;
      return `
        <article class="node root ${selected}" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px">
          <span class="pin out"></span>
          <div class="node-header">
            <span class="node-kind">T</span>
            <div class="node-title">
              <strong>${escapeHtml(file.className)}</strong>
              <small>${escapeHtml(file.path)}</small>
            </div>
          </div>
          <div class="node-body">
            <div class="node-row"><span>fields</span><span class="node-value">${fieldCount}</span></div>
            <div class="node-row"><span>kind</span><span class="node-value">${escapeHtml(file.kind)}</span></div>
          </div>
        </article>
      `;
    }

    return `
      <article class="node field ${selected}" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px">
        <span class="pin in"></span>
        <div class="node-header">
          <span class="node-kind">F</span>
          <div class="node-title">
            <strong>${escapeHtml(node.fieldName)}</strong>
            <small>${escapeHtml(node.type)}${node.required ? " / required" : ""}</small>
          </div>
        </div>
        <div class="node-body">
          <div class="node-row"><span>value</span><span class="node-value">${escapeHtml(formatValue(node.value))}</span></div>
          <div class="node-row"><span>source</span><span class="node-value">literal</span></div>
        </div>
      </article>
    `;
  }

  function renderWires(file) {
    const wireLayer = document.getElementById("wireLayer");
    const root = file.nodes.find((item) => item.kind === "root");
    if (!root) {
      wireLayer.innerHTML = "";
      return;
    }

    const paths = file.nodes.filter((item) => item.kind === "field").map((node) => {
      const sx = root.x + 236;
      const sy = root.y + 43;
      const tx = node.x;
      const ty = node.y + 43;
      const dx = Math.max(90, (tx - sx) * 0.45);
      const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
      return `<path class="wire-shadow" d="${d}"></path><path class="wire" d="${d}"></path>`;
    });
    wireLayer.innerHTML = paths.join("");
  }

  function renderCanvasMode() {
    document.querySelectorAll("[data-canvas-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.canvasMode === state.canvasMode);
    });
  }

  function renderInspector() {
    const body = document.getElementById("inspectorBody");
    const subtitle = document.getElementById("selectionSubtitle");
    const badge = document.getElementById("activeFileBadge");
    const file = getActiveFile();

    if (!state.project) {
      subtitle.textContent = "未加载项目";
      badge.textContent = "-";
      body.innerHTML = "";
      return;
    }

    if (!file) {
      subtitle.textContent = "项目清单";
      badge.textContent = "mod.json";
      body.innerHTML = renderManifestInspector();
      return;
    }

    badge.textContent = `${file.name}.json`;
    const node = getSelectedNode() || file.nodes[0];
    state.selectedNodeId = node ? node.id : null;

    if (!node) {
      subtitle.textContent = "未选择节点";
      body.innerHTML = "";
      return;
    }

    subtitle.textContent = node.kind === "root" ? "类型节点" : `字段 ${node.fieldName}`;
    body.innerHTML = node.kind === "root" ? renderRootInspector(file, node) : renderFieldInspector(node);
  }

  function renderManifestInspector() {
    const manifest = state.project.manifest;
    return `
      <section class="property-group">
        <h3>mod.json</h3>
        ${textControl("内部名称", "name", manifest.name, "manifest")}
        ${textControl("显示名称", "displayName", manifest.displayName, "manifest")}
        ${textControl("作者", "author", manifest.author, "manifest")}
        ${textControl("版本", "version", manifest.version, "manifest")}
        ${textControl("最低游戏版本", "minGameVersion", manifest.minGameVersion, "manifest")}
        <div class="property-control">
          <label>说明</label>
          <textarea data-manifest="description" rows="4">${escapeHtml(manifest.description)}</textarea>
        </div>
      </section>
      <section class="property-group">
        <h3>项目操作</h3>
        <button type="button" class="tool-button" data-action="download-snapshot">导出项目快照</button>
      </section>
    `;
  }

  function renderRootInspector(file) {
    const classes = (state.classes.length ? state.classes : TYPE_CATALOG.map((item) => item.name))
      .map((name) => `<option value="${escapeHtml(name)}" ${name === file.className ? "selected" : ""}>${escapeHtml(name)}</option>`)
      .join("");
    const typeDoc = TYPE_CATALOG.find((item) => item.name === file.className)?.doc || "";
    return `
      <section class="property-group">
        <h3>文件</h3>
        ${textControl("文件名", "name", file.name, "fileProp")}
        <div class="property-control">
          <label>内容类型</label>
          <select data-file-prop="kind">
            ${Object.keys(KIND_DEFAULT_CLASS).map((kind) => `<option value="${kind}" ${kind === file.kind ? "selected" : ""}>${kind}</option>`).join("")}
          </select>
        </div>
        <div class="property-control">
          <label>Mindustry 类型</label>
          <select data-file-class="className">${classes}</select>
        </div>
        <div class="field-doc">${escapeHtml(typeDoc)}</div>
      </section>
      <section class="property-group">
        <h3>节点</h3>
        <button type="button" class="tool-button danger" data-action="delete-file">删除当前 JSON</button>
      </section>
    `;
  }

  function renderFieldInspector(node) {
    return `
      <section class="property-group">
        <h3>字段</h3>
        <div class="property-control">
          <label>字段名</label>
          <input value="${escapeHtml(node.fieldName)}" readonly>
        </div>
        <div class="property-control">
          <label>类型</label>
          <input value="${escapeHtml(node.type)}" readonly>
        </div>
        <div class="field-doc">${escapeHtml(node.doc || "暂无字段说明")}</div>
      </section>
      <section class="property-group">
        <h3>值</h3>
        ${renderValueEditor(node)}
      </section>
      <section class="property-group">
        <h3>节点操作</h3>
        <button type="button" class="tool-button danger" data-action="delete-node">删除字段节点</button>
      </section>
    `;
  }

  function renderValueEditor(node) {
    if (node.type === "Boolean") {
      return `
        <div class="toggle-row">
          <span>${node.value === "true" ? "true" : "false"}</span>
          <button type="button" class="toggle ${node.value === "true" ? "is-on" : ""}" data-action="toggle-field-boolean" aria-label="切换布尔值"></button>
        </div>
      `;
    }

    if (["Int", "Float"].includes(node.type)) {
      return `
        <div class="property-control">
          <label>数值</label>
          <input type="number" step="${node.type === "Int" ? "1" : "0.01"}" value="${escapeHtml(node.value)}" data-field-value="value">
        </div>
      `;
    }

    if (node.type === "Color") {
      const color = /^#[0-9a-f]{6}$/i.test(node.value) ? node.value : "#42d190";
      return `
        <div class="property-control">
          <label>颜色</label>
          <input type="color" value="${escapeHtml(color)}" data-field-value="value">
        </div>
        <div class="property-control">
          <label>颜色文本</label>
          <input value="${escapeHtml(node.value)}" data-field-value="value">
        </div>
      `;
    }

    if (node.type.startsWith("Array")) {
      return `
        <div class="property-control">
          <label>数组，每行或逗号分隔一项</label>
          <textarea rows="5" data-field-value="value">${escapeHtml(node.value)}</textarea>
        </div>
      `;
    }

    if (node.type === "Object") {
      return `
        <div class="property-control">
          <label>对象 JSON</label>
          <textarea rows="6" data-field-value="value">${escapeHtml(node.value || "{}")}</textarea>
        </div>
      `;
    }

    return `
      <div class="property-control">
        <label>文本</label>
        <input value="${escapeHtml(node.value)}" data-field-value="value">
      </div>
    `;
  }

  function textControl(label, key, value, datasetName) {
    const attr = datasetName === "manifest" ? `data-manifest="${key}"` : `data-file-prop="${key}"`;
    return `
      <div class="property-control">
        <label>${escapeHtml(label)}</label>
        <input value="${escapeHtml(value || "")}" ${attr}>
      </div>
    `;
  }

  function renderDockTabs() {
    document.querySelectorAll("[data-dock-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.dockTab === state.dockTab);
    });
  }

  function renderDock() {
    const body = document.getElementById("dockBody");
    if (state.dockTab === "json") {
      body.innerHTML = `
        <pre class="code-preview">${escapeHtml(JSON.stringify(getActiveJson(), null, 2))}</pre>
      `;
      return;
    }

    if (state.dockTab === "problems") {
      const problems = state.problems.length ? state.problems : [{ level: "ok", scope: "project", message: "当前没有发现问题。" }];
      body.innerHTML = `
        <ul class="problem-list">
          ${problems.map((item) => `
            <li class="problem-item ${escapeHtml(item.level)}">
              <strong>${escapeHtml(item.level)}</strong>
              <span>${escapeHtml(item.scope)}：${escapeHtml(item.message)}</span>
            </li>
          `).join("")}
        </ul>
      `;
      return;
    }

    if (state.dockTab === "logs") {
      body.innerHTML = `
        <ul class="log-list">
          ${state.logs.slice(-80).reverse().map((item) => `
            <li class="log-item">
              <strong>${escapeHtml(item.level)}</strong>
              <span>${escapeHtml(item.message)} <small>${escapeHtml(item.time)}</small></span>
            </li>
          `).join("")}
        </ul>
      `;
      return;
    }

    body.innerHTML = renderPackageDock();
  }

  function renderPackageDock() {
    const plan = getPackagePlan();
    const steps = state.packageJob?.steps || [
      { name: "校验项目", status: "pending" },
      { name: "生成 mod.json", status: "pending" },
      { name: "写入 content JSON", status: "pending" },
      { name: "复制资源目录", status: "pending" },
      { name: "请求后端 zip 打包", status: "pending" },
    ];
    return `
      <div class="package-toolbar">
        <button type="button" class="tool-button primary" data-action="package-project">执行打包流程</button>
        <button type="button" class="tool-button" data-action="download-package-plan">导出打包清单</button>
        <span class="pill">${plan.fileCount} 个文件</span>
      </div>
      <ul class="package-list" style="margin-top:10px">
        ${steps.map((item) => `
          <li class="package-item ${item.status === "done" ? "done" : ""}">
            <strong>${escapeHtml(item.status)}</strong>
            <span>${escapeHtml(item.name)} <small>${escapeHtml(item.note || "")}</small></span>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function getActiveJson() {
    if (!state.project) return {};
    if (state.activeFileId === "manifest") return getManifestJson();
    const file = getActiveFile();
    return file ? buildJsonForFile(file) : getManifestJson();
  }

  function getManifestJson() {
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

  function buildJsonForFile(file) {
    const json = { type: file.className };
    file.nodes.filter((item) => item.kind === "field").forEach((node) => {
      json[node.fieldName] = coerceValue(node);
    });
    return json;
  }

  function coerceValue(node) {
    const value = String(node.value || "").trim();
    if (node.type === "Boolean") return value === "true";
    if (node.type === "Int") return Number.parseInt(value || "0", 10);
    if (node.type === "Float") return Number.parseFloat(value || "0");
    if (node.type.startsWith("Array")) {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          if (item.includes("/")) {
            const parts = item.split("/");
            return { item: parts[0].trim(), amount: Number.parseInt(parts[1], 10) || 0 };
          }
          return item;
        });
    }
    if (node.type === "Object") {
      try {
        return JSON.parse(value || "{}");
      } catch (_) {
        return {};
      }
    }
    return value;
  }

  function validateProject() {
    const problems = [];
    if (!state.project) return problems;

    const manifest = state.project.manifest;
    if (!manifest.name) problems.push(problem("error", "mod.json", "缺少内部名称 name。"));
    if (!/^[a-z0-9._-]+$/.test(manifest.name)) problems.push(problem("error", "mod.json", "name 只能包含小写字母、数字、点、下划线和短横线。"));
    if (!manifest.displayName) problems.push(problem("warning", "mod.json", "缺少显示名称 displayName。"));

    const paths = new Set();
    state.project.files.forEach((file) => {
      if (paths.has(file.path)) problems.push(problem("error", file.path, "文件路径重复。"));
      paths.add(file.path);
      const fields = file.nodes.filter((item) => item.kind === "field");
      getFieldsForClass(file.className).filter((item) => item.required).forEach((requiredField) => {
        const node = fields.find((item) => item.fieldName === requiredField.name);
        if (!node || String(node.value || "").trim() === "") {
          problems.push(problem("warning", file.path, `建议填写必需字段 ${requiredField.name}。`));
        }
      });
      fields.forEach((node) => {
        if (["Int", "Float"].includes(node.type) && Number.isNaN(Number(node.value))) {
          problems.push(problem("error", file.path, `${node.fieldName} 需要是数字。`));
        }
        if (node.type === "Object") {
          try {
            JSON.parse(node.value || "{}");
          } catch (error) {
            problems.push(problem("error", file.path, `${node.fieldName} 不是合法对象 JSON。`));
          }
        }
      });
    });

    state.problems = problems;
    addLog("validate", problems.length ? `发现 ${problems.length} 个问题` : "校验通过");
    return problems;
  }

  function problem(level, scope, message) {
    return { level, scope, message };
  }

  function packageProject() {
    const problems = validateProject();
    const hasError = problems.some((item) => item.level === "error");
    state.dockTab = "package";
    state.packageJob = {
      steps: [
        { name: "校验项目", status: hasError ? "blocked" : "done", note: hasError ? "存在错误，已停止" : "通过" },
        { name: "生成 mod.json", status: hasError ? "pending" : "done", note: "前端已生成" },
        { name: "写入 content JSON", status: hasError ? "pending" : "done", note: `${state.project.files.length} 个 JSON` },
        { name: "复制资源目录", status: hasError ? "pending" : "done", note: "sprites/sounds/bundles 占位" },
        { name: "请求后端 zip 打包", status: hasError ? "pending" : "done", note: state.api.mode === "mock" ? "Mock 完成，等待后端接口" : "已发送请求" },
      ],
    };

    if (!hasError) {
      state.api.request("PackageMod", getPackagePlan());
      addLog("package", "打包流程已完成前端闭环");
    }
    renderAll();
  }

  function getPackagePlan() {
    if (!state.project) return { fileCount: 0, files: {} };
    const files = {
      "mod.json": getManifestJson(),
    };
    state.project.files.forEach((file) => {
      files[file.path] = buildJsonForFile(file);
    });
    return {
      modName: state.project.manifest.name,
      fileCount: Object.keys(files).length,
      files,
      assets: state.project.assets,
    };
  }

  function saveProject() {
    if (!state.project) return;
    state.project.updatedAt = new Date().toISOString();
    localStorage.setItem("mindustrymit.visual-editor.project", JSON.stringify({ version: 1, project: state.project }));
    state.api.request("SaveProject", { Project: state.project });
    addLog("project", "项目已保存到浏览器本地缓存");
    renderDock();
  }

  function downloadProjectSnapshot() {
    download(`${state.project.manifest.name}-project.json`, JSON.stringify({ version: 1, project: state.project }, null, 2), "application/json");
    addLog("project", "已导出项目快照");
  }

  function downloadCurrentJson() {
    const file = getActiveFile();
    const name = file ? `${file.name}.json` : "mod.json";
    download(name, JSON.stringify(getActiveJson(), null, 2), "application/json");
  }

  function downloadPackagePlan() {
    download(`${state.project.manifest.name}-package-plan.json`, JSON.stringify(getPackagePlan(), null, 2), "application/json");
    addLog("package", "已导出打包清单");
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importJsonAsContent(data, fileName) {
    const className = data.type || "Block";
    const kind = className === "Item" ? "items" : className === "Liquid" ? "liquids" : className === "UnitType" ? "units" : "blocks";
    const file = createContentFile(kind, className, fileName.replace(/\.json$/i, ""));
    file.nodes = file.nodes.filter((item) => item.kind === "root");
    Object.entries(data).forEach(([key, value]) => {
      if (key === "type") return;
      const meta = getFieldsForClass(className).find((item) => item.name === key) || field(key, inferType(value), stringifyImportedValue(value), "导入字段");
      const node = addFieldNode(file, meta, true);
      node.value = stringifyImportedValue(value);
    });
    state.activeFileId = file.id;
    state.selectedNodeId = file.nodes[0].id;
    addLog("project", `已导入 JSON：${fileName}`);
  }

  function inferType(value) {
    if (typeof value === "boolean") return "Boolean";
    if (typeof value === "number") return Number.isInteger(value) ? "Int" : "Float";
    if (Array.isArray(value)) return "Array<Object>";
    if (value && typeof value === "object") return "Object";
    return "String";
  }

  function stringifyImportedValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join("\n");
    }
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value ?? "");
  }

  function deleteSelectedNode() {
    const file = getActiveFile();
    const node = getSelectedNode();
    if (!file || !node || node.kind === "root") return;
    file.nodes = file.nodes.filter((item) => item.id !== node.id);
    state.selectedNodeId = file.nodes[0]?.id || null;
    addLog("edit", `已删除字段 ${node.fieldName}`);
    renderAll();
  }

  function deleteActiveFile() {
    const file = getActiveFile();
    if (!file) return;
    state.project.files = state.project.files.filter((item) => item.id !== file.id);
    state.activeFileId = state.project.files[0]?.id || "manifest";
    state.selectedNodeId = getActiveFile()?.nodes[0]?.id || null;
    addLog("project", `已删除 ${file.path}`);
    renderAll();
  }

  function toggleSelectedBoolean() {
    const node = getSelectedNode();
    if (!node || node.type !== "Boolean") return;
    node.value = node.value === "true" ? "false" : "true";
    renderAll();
  }

  function openProjectModal() {
    document.getElementById("projectModal").classList.remove("hidden");
  }

  function closeProjectModal() {
    document.getElementById("projectModal").classList.add("hidden");
  }

  function getActiveFile() {
    if (!state.project || state.activeFileId === "manifest") return null;
    return state.project.files.find((file) => file.id === state.activeFileId) || null;
  }

  function getSelectedNode() {
    const file = getActiveFile();
    if (!file) return null;
    return file.nodes.find((node) => node.id === state.selectedNodeId) || null;
  }

  function addLog(level, message) {
    state.logs.push({
      level,
      message,
      time: new Date().toLocaleTimeString(),
    });
    if (state.logs.length > 160) state.logs.shift();
    if (document.getElementById("dockBody") && state.dockTab === "logs") renderDock();
  }

  function uniqueFileName(kind, base) {
    const clean = slugify(base || "content");
    let candidate = clean;
    let index = 2;
    const exists = (name) => state.project.files.some((file) => file.kind === kind && file.name === name);
    while (exists(candidate)) {
      candidate = `${clean}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function slugify(value) {
    const slug = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\.json$/i, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "content";
  }

  function toTitle(value) {
    return String(value || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatValue(value) {
    const text = String(value ?? "");
    return text.length > 30 ? `${text.slice(0, 27)}...` : text || "null";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
