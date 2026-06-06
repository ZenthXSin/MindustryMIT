(function () {
  if (window.MindustryVisualEditorLoaded) return;
  window.MindustryVisualEditorLoaded = true;

  const NODE_WIDTH = 236;
  const CLASS_KINDS = {
    blocks: "Wall",
    items: "Item",
    liquids: "Liquid",
    units: "UnitType",
    "status-effects": "StatusEffect",
    weathers: "Weather",
    planets: "Planet",
  };

  const TYPE_CATALOG = [
    type("Content", "", "Mindustry content base type."),
    type("UnlockableContent", "Content", "Content that can be unlocked in game."),
    type("Block", "UnlockableContent", "Base type for block JSON."),
    type("Wall", "Block", "Defensive block."),
    type("Drill", "Block", "Ore mining block."),
    type("Conveyor", "Block", "Item transport block."),
    type("Turret", "Block", "Ammo driven turret block."),
    type("Item", "UnlockableContent", "Item definition."),
    type("Liquid", "UnlockableContent", "Liquid definition."),
    type("UnitType", "UnlockableContent", "Unit definition."),
    type("StatusEffect", "UnlockableContent", "Unit status effect."),
    type("Weather", "Content", "Weather definition."),
    type("Planet", "Content", "Planet definition."),
    type("Weapon", "", "Nested weapon object."),
    type("BulletType", "", "Nested bullet object."),
  ];

  const FIELD_CATALOG = {
    Block: [
      field("name", "String", "sample-block", "内部名称。", true),
      field("localizedName", "String", "Sample Block", "显示名称。"),
      field("description", "String", "", "说明文本。"),
      field("size", "Int", "1", "方块尺寸。", true),
      field("health", "Int", "120", "生命值。"),
      field("requirements", "Array<ItemStack>", "copper/20", "建造消耗。", false, ["Item"]),
      field("category", "String", "defense", "建造分类。"),
      field("research", "String", "", "科技树前置。", false, ["Block", "Item", "Liquid", "UnitType"]),
      field("alwaysUnlocked", "Boolean", "false", "是否默认解锁。"),
    ],
    Wall: [
      field("armor", "Float", "0", "额外护甲。"),
      field("absorbLasers", "Boolean", "false", "是否吸收激光。"),
      field("insulated", "Boolean", "false", "是否绝缘。"),
    ],
    Drill: [
      field("drillTime", "Float", "280", "采矿时间。", true),
      field("tier", "Int", "2", "采矿层级。"),
      field("liquidBoostIntensity", "Float", "1.6", "液体增强倍率。"),
    ],
    Conveyor: [
      field("speed", "Float", "0.08", "运输速度。", true),
      field("junctionReplacement", "String", "", "替换交叉运输块。", false, ["Block"]),
      field("bridgeReplacement", "String", "", "替换桥接运输块。", false, ["Block"]),
    ],
    Turret: [
      field("range", "Float", "160", "攻击范围。", true),
      field("reload", "Float", "45", "装填时间。"),
      field("ammoTypes", "Object", "{}", "弹药映射。", false, ["BulletType"]),
      field("targetAir", "Boolean", "true", "攻击空中目标。"),
      field("targetGround", "Boolean", "true", "攻击地面目标。"),
    ],
    Item: [
      field("name", "String", "sample-item", "内部名称。", true),
      field("localizedName", "String", "Sample Item", "显示名称。"),
      field("description", "String", "", "说明文本。"),
      field("color", "Color", "#8fc7ff", "颜色。"),
      field("cost", "Float", "1", "成本系数。"),
      field("hardness", "Int", "1", "硬度。"),
      field("explosiveness", "Float", "0", "爆炸性。"),
      field("flammability", "Float", "0", "易燃性。"),
    ],
    Liquid: [
      field("name", "String", "sample-liquid", "内部名称。", true),
      field("localizedName", "String", "Sample Liquid", "显示名称。"),
      field("description", "String", "", "说明文本。"),
      field("color", "Color", "#65d5ff", "颜色。"),
      field("heatCapacity", "Float", "0.5", "热容量。"),
      field("temperature", "Float", "0.5", "温度。"),
      field("viscosity", "Float", "0.5", "粘度。"),
    ],
    UnitType: [
      field("name", "String", "sample-unit", "内部名称。", true),
      field("localizedName", "String", "Sample Unit", "显示名称。"),
      field("description", "String", "", "说明文本。"),
      field("health", "Int", "360", "生命值。", true),
      field("speed", "Float", "1.2", "移动速度。"),
      field("flying", "Boolean", "false", "是否飞行。"),
      field("weapons", "Array<Object>", "", "武器列表。", false, ["Weapon"]),
      field("research", "String", "", "科技树前置。", false, ["Block", "Item", "Liquid", "UnitType"]),
    ],
    Weapon: [
      field("name", "String", "weapon", "武器名称。"),
      field("reload", "Float", "30", "装填时间。"),
      field("x", "Float", "0", "挂点 X。"),
      field("y", "Float", "0", "挂点 Y。"),
      field("bullet", "Object", "{}", "子弹对象。", false, ["BulletType"]),
    ],
    BulletType: [
      field("damage", "Float", "20", "伤害。", true),
      field("speed", "Float", "4", "速度。"),
      field("lifetime", "Float", "60", "持续时间。"),
      field("splashDamage", "Float", "0", "范围伤害。"),
    ],
    StatusEffect: [
      field("name", "String", "sample-effect", "内部名称。", true),
      field("localizedName", "String", "Sample Effect", "显示名称。"),
      field("color", "Color", "#f2b95f", "颜色。"),
      field("damage", "Float", "0", "每帧伤害。"),
      field("speedMultiplier", "Float", "1", "速度倍率。"),
    ],
    Weather: [
      field("name", "String", "sample-weather", "内部名称。", true),
      field("localizedName", "String", "Sample Weather", "显示名称。"),
      field("duration", "Float", "600", "持续时间。"),
    ],
    Planet: [
      field("name", "String", "sample-planet", "内部名称。", true),
      field("localizedName", "String", "Sample Planet", "显示名称。"),
      field("radius", "Float", "1", "半径。"),
      field("visible", "Boolean", "true", "是否可见。"),
    ],
  };

  const BUILTIN_INSTANCES = {
    blocks: {
      className: "Block",
      values: ["core-shard", "core-foundation", "copper-wall", "mechanical-drill", "duo", "router"],
    },
    items: {
      className: "Item",
      values: ["copper", "lead", "graphite", "silicon", "titanium", "thorium"],
    },
    liquids: {
      className: "Liquid",
      values: ["water", "slag", "oil", "cryofluid"],
    },
    units: {
      className: "UnitType",
      values: ["dagger", "mace", "fortress", "mono", "poly"],
    },
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
    panX: 0,
    panY: 0,
    logs: [],
    problems: [],
    packageJob: null,
    drag: null,
    pan: null,
    pendingConnection: null,
    fieldMenuOwnerId: null,
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
          if (this.mode === "ws") addLog("ws", "后端连接已断开，回退到 Mock API");
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
        this.socket.send(JSON.stringify({ wsType, content: JSON.stringify(payload || {}), out: false, dataList: {} }));
      }
      return mockRequest(wsType, payload || {});
    }
  }

  function type(name, parentType, doc) {
    return { name, parentType, doc };
  }

  function field(name, fieldType, defaultValue, notes, required, accepts) {
    return { name, type: fieldType, defaultValue, notes, required: Boolean(required), accepts: accepts || [] };
  }

  function mockRequest(wsType, payload) {
    switch (wsType) {
      case "Init":
        return Promise.resolve({ Success: true, Doc_Count: TYPE_CATALOG.length, Message: "Mock docs loaded" });
      case "AllClass":
        return Promise.resolve({ Class_List: TYPE_CATALOG.map((item) => item.name) });
      case "AllField":
        return Promise.resolve({ Field_List: getFieldsForClass(payload.Class_Name).map((item) => item.name) });
      case "PackageMod":
        return Promise.resolve({ Success: true });
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
    document.addEventListener("mouseup", stopPointerWork);

    document.getElementById("nodeLayer").addEventListener("mousedown", startNodeDrag);
    document.getElementById("canvasViewport").addEventListener("mousedown", startCanvasPan);
    document.getElementById("projectFileInput").addEventListener("change", handleProjectFile);
  }

  function startNodeDrag(event) {
    const nodeElement = event.target.closest(".node");
    if (!nodeElement) return;
    if (event.target.closest("button,input,select,textarea,.pin")) return;

    const file = getActiveFile();
    const node = file && findNode(file, nodeElement.dataset.nodeId);
    if (!node) return;

    state.selectedNodeId = node.id;
    state.fieldMenuOwnerId = null;
    state.drag = {
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      x: node.x,
      y: node.y,
    };
    renderCanvas();
    renderInspector();
    event.preventDefault();
  }

  function startCanvasPan(event) {
    if (event.target.closest(".node") || event.target.closest("button,input,select,textarea")) return;
    state.pan = {
      startX: event.clientX,
      startY: event.clientY,
      x: state.panX,
      y: state.panY,
    };
    state.fieldMenuOwnerId = null;
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (state.drag) {
      const file = getActiveFile();
      const node = file && findNode(file, state.drag.nodeId);
      if (!node) return;
      node.x = state.drag.x + (event.clientX - state.drag.startX) / state.zoom;
      node.y = state.drag.y + (event.clientY - state.drag.startY) / state.zoom;
      placeNode(node);
      renderWires(file);
      return;
    }

    if (state.pan) {
      state.panX = state.pan.x + event.clientX - state.pan.startX;
      state.panY = state.pan.y + event.clientY - state.pan.startY;
      applyCanvasTransform();
    }
  }

  function stopPointerWork() {
    state.drag = null;
    state.pan = null;
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
      renderDockTabs();
      renderDock();
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
      state.fieldMenuOwnerId = null;
      renderAll();
      return;
    }

    const fieldTarget = event.target.closest("[data-field-name]");
    if (fieldTarget) {
      addFieldToActive(fieldTarget.dataset.fieldName, fieldTarget.dataset.ownerId);
      return;
    }

    const nodeTarget = event.target.closest(".node");
    if (nodeTarget) {
      state.selectedNodeId = nodeTarget.dataset.nodeId;
      state.fieldMenuOwnerId = null;
      renderCanvas();
      renderInspector();
      renderFieldPalette();
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (target.id === "fieldSearch") {
      state.fieldSearch = target.value;
      renderFieldPalette();
      renderCanvas();
      return;
    }

    if (target.dataset.manifest && state.project) {
      state.project.manifest[target.dataset.manifest] = target.value;
      renderProjectSummary();
      renderDock();
      return;
    }

    const file = getActiveFile();
    if (!file) return;

    if (target.dataset.fileProp) {
      file[target.dataset.fileProp] = target.value;
      if (target.dataset.fileProp === "name") file.path = `content/${file.kind}/${slugify(target.value)}.json`;
      renderTree();
      renderCanvas();
      renderDock();
      return;
    }

    if (target.dataset.instanceName) {
      const node = getSelectedNode();
      if (!node || node.kind !== "class") return;
      node.instanceName = target.value;
      if (node.role === "root") {
        file.name = slugify(target.value);
        file.path = `content/${file.kind}/${file.name}.json`;
      }
      renderTree();
      renderCanvas();
      renderDock();
      return;
    }

    if (target.dataset.fieldValue) {
      const node = getSelectedNode();
      if (!node || node.kind !== "field") return;
      node.value = target.value;
      renderCanvas();
      renderDock();
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (target.id === "contentKind") {
      document.getElementById("classPicker").value = CLASS_KINDS[target.value] || "Block";
      return;
    }

    const file = getActiveFile();
    if (!file) return;

    if (target.dataset.nodeClass) {
      const node = findNode(file, target.dataset.nodeClass);
      if (!node || node.kind !== "class") return;
      node.className = target.value;
      node.title = target.value;
      if (node.role === "root") file.className = target.value;
      removeInvalidFieldConnections(file, node.id);
      renderAll();
      return;
    }

    if (target.dataset.fileProp) {
      file[target.dataset.fileProp] = target.value;
      file.path = `content/${file.kind}/${slugify(file.name)}.json`;
      renderAll();
      return;
    }

    if (target.dataset.builtinKind) {
      const node = findNode(file, target.dataset.builtinKind);
      if (!node || node.kind !== "builtin") return;
      const catalog = BUILTIN_INSTANCES[target.value];
      node.builtinKind = target.value;
      node.className = catalog.className;
      node.value = catalog.values[0];
      renderAll();
      return;
    }

    if (target.dataset.builtinValue) {
      const node = findNode(file, target.dataset.builtinValue);
      if (!node || node.kind !== "builtin") return;
      node.value = target.value;
      renderAll();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "projectForm") {
      event.preventDefault();
      createProject(Object.fromEntries(new FormData(event.target).entries()));
      closeProjectModal();
      renderAll();
      return;
    }

    if (event.target.id === "connectionForm") {
      event.preventDefault();
      const url = document.getElementById("wsUrl").value.trim();
      addLog("ws", `尝试连接 ${url}`);
      state.api.connect(url).then(() => {
        addLog("ws", "WebSocket 已连接");
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
        if (data.project && Array.isArray(data.project.files)) {
          state.project = migrateProject(data.project);
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
      case "add-content-kind":
        createContentFromPicker();
        break;
      case "add-class-node":
        addClassNode();
        break;
      case "add-builtin-node":
        addBuiltinNode();
        break;
      case "open-field-menu":
        state.fieldMenuOwnerId = target.dataset.nodeId;
        state.selectedNodeId = target.dataset.nodeId;
        renderCanvas();
        renderInspector();
        renderFieldPalette();
        break;
      case "close-field-menu":
        state.fieldMenuOwnerId = null;
        renderCanvas();
        break;
      case "start-connection":
        startConnection(target.dataset.nodeId);
        break;
      case "finish-connection":
        finishConnection(target.dataset.nodeId);
        break;
      case "clear-connection":
        clearSelectedConnection();
        break;
      case "create-class-for-field":
        createClassForSelectedField();
        break;
      case "create-builtin-for-field":
        createBuiltinForSelectedField();
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
        state.panX = 0;
        state.panY = 0;
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
      case "download-snapshot":
        downloadProjectSnapshot();
        break;
      case "download-json":
        downloadCurrentJson();
        break;
      case "download-package-plan":
        downloadPackagePlan();
        break;
      default:
        break;
    }
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
      assets: { sprites: [], sounds: [], bundles: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const firstFile = createContentFile(starterKind, CLASS_KINDS[starterKind] || "Block", data.name || "sample-block");
    state.activeFileId = firstFile.id;
    state.selectedNodeId = firstFile.nodes[0].id;
    validateProject();
  }

  function createContentFromPicker() {
    const kind = document.getElementById("contentKind").value;
    const className = document.getElementById("classPicker").value || CLASS_KINDS[kind] || "Block";
    const file = createContentFile(kind, className, `${state.project.manifest.name}-${kind}`);
    state.activeFileId = file.id;
    state.selectedNodeId = file.nodes[0].id;
    addLog("project", `新增 ${file.path}`);
    renderAll();
  }

  function createContentFile(kind, className, baseName) {
    const name = uniqueFileName(kind, slugify(baseName || className));
    const rootId = uid("node");
    const file = {
      id: uid("file"),
      kind,
      name,
      className,
      path: `content/${kind}/${name}.json`,
      nodes: [
        {
          id: rootId,
          kind: "class",
          role: "root",
          title: className,
          className,
          instanceName: name,
          x: 460,
          y: 140,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.project.files.push(file);
    addRequiredFields(file, rootId);
    return file;
  }

  function addClassNode(className, x, y) {
    const file = getActiveFile();
    if (!file) return null;
    const chosen = className || firstAcceptedClass(getSelectedNode()) || "Block";
    const node = {
      id: uid("node"),
      kind: "class",
      role: "local",
      title: chosen,
      className: chosen,
      instanceName: slugify(chosen),
      x: x ?? 860,
      y: y ?? 160 + file.nodes.filter((item) => item.kind === "class").length * 90,
    };
    file.nodes.push(node);
    state.selectedNodeId = node.id;
    addLog("edit", `新增 Class 定义块 ${chosen}`);
    renderAll();
    return node;
  }

  function addBuiltinNode(kind, x, y) {
    const file = getActiveFile();
    if (!file) return null;
    const chosenKind = kind || "blocks";
    const catalog = BUILTIN_INSTANCES[chosenKind];
    const node = {
      id: uid("node"),
      kind: "builtin",
      builtinKind: chosenKind,
      className: catalog.className,
      value: catalog.values[0],
      x: x ?? 850,
      y: y ?? 380 + file.nodes.filter((item) => item.kind === "builtin").length * 90,
    };
    file.nodes.push(node);
    state.selectedNodeId = node.id;
    addLog("edit", `新增内置实例 ${chosenKind}/${node.value}`);
    renderAll();
    return node;
  }

  function addRequiredFields(file, ownerId) {
    getFieldsForClass(findNode(file, ownerId)?.className || file.className)
      .filter((item) => item.required)
      .slice(0, 4)
      .forEach((item) => addFieldNode(file, ownerId, item));
  }

  function addFieldToActive(fieldName, explicitOwnerId) {
    const file = getActiveFile();
    if (!file) return;
    const owner = getFieldOwner(file, explicitOwnerId);
    if (!owner) return;

    const existing = file.nodes.find((item) => item.kind === "field" && item.ownerId === owner.id && item.fieldName === fieldName);
    if (existing) {
      state.selectedNodeId = existing.id;
      state.fieldMenuOwnerId = null;
      renderCanvas();
      renderInspector();
      return;
    }

    const meta = getFieldsForClass(owner.className).find((item) => item.name === fieldName);
    if (!meta) return;
    const node = addFieldNode(file, owner.id, meta);
    state.selectedNodeId = node.id;
    state.fieldMenuOwnerId = null;
    addLog("edit", `为 ${owner.className} 添加字段 ${fieldName}`);
    renderAll();
  }

  function addFieldNode(file, ownerId, meta) {
    const owner = findNode(file, ownerId);
    const index = file.nodes.filter((item) => item.kind === "field" && item.ownerId === ownerId).length;
    const node = {
      id: uid("node"),
      kind: "field",
      ownerId,
      fieldName: meta.name,
      type: meta.type,
      required: meta.required,
      accepts: meta.accepts || [],
      doc: meta.notes,
      value: defaultValueForField(meta, file, owner),
      connectionId: null,
      x: (owner?.x || 460) - 320,
      y: (owner?.y || 140) + 76 + index * 116,
    };
    file.nodes.push(node);
    return node;
  }

  function defaultValueForField(meta, file, owner) {
    if (meta.name === "name") return owner?.instanceName || file.name;
    if (meta.name === "localizedName") return toTitle(owner?.instanceName || file.name);
    return meta.defaultValue || "";
  }

  function getFieldOwner(file, explicitOwnerId) {
    if (explicitOwnerId) return findNode(file, explicitOwnerId);
    if (state.fieldMenuOwnerId) return findNode(file, state.fieldMenuOwnerId);
    const selected = getSelectedNode();
    if (selected?.kind === "class") return selected;
    if (selected?.kind === "field") return findNode(file, selected.ownerId);
    return file.nodes.find((item) => item.kind === "class" && item.role === "root");
  }

  function getFieldsForClass(className) {
    const inherited = [];
    const typeMeta = TYPE_CATALOG.find((item) => item.name === className);
    if (typeMeta?.parentType && FIELD_CATALOG[typeMeta.parentType]) inherited.push(...FIELD_CATALOG[typeMeta.parentType]);
    if (className !== "Block" && ["Wall", "Drill", "Conveyor", "Turret"].includes(className)) inherited.unshift(...FIELD_CATALOG.Block);
    const own = FIELD_CATALOG[className] || [];
    const seen = new Set();
    return [...inherited, ...own].filter((item) => {
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
    label.textContent = state.api?.mode === "ws" ? `已连接 ${state.api.url}` : "Mock API 就绪，等待 Java WS 接口";
  }

  function renderProjectSummary() {
    const subtitle = document.getElementById("projectSubtitle");
    subtitle.textContent = state.project ? `${state.project.manifest.displayName} / ${state.project.files.length} 个 JSON` : "未加载";
  }

  function renderClassPicker() {
    const picker = document.getElementById("classPicker");
    const selected = picker.value || "Wall";
    const classes = getClassNames();
    picker.innerHTML = classes.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
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
      ...Object.keys(CLASS_KINDS).map((kind) => [
        `content/${kind}`,
        state.project.files.filter((file) => file.kind === kind).map((file) => ({ id: file.id, title: `${file.name}.json`, meta: file.className })),
      ]),
      ["assets/sprites", []],
      ["assets/sounds", []],
      ["bundles", []],
    ];

    tree.innerHTML = groups.map(([title, files]) => `
      <div class="tree-folder">
        <div class="tree-folder-header"><span>${escapeHtml(title)}</span><span>${files.length}</span></div>
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
    const owner = file && getFieldOwner(file);
    if (!owner) {
      count.textContent = "0";
      palette.innerHTML = `<div class="field-card"><div><strong>选择 Class 块</strong><small>字段库会按选中的 Class 显示</small></div></div>`;
      return;
    }

    const used = new Set(file.nodes.filter((item) => item.kind === "field" && item.ownerId === owner.id).map((item) => item.fieldName));
    const fields = getFieldsForClass(owner.className).filter((item) => {
      const text = `${item.name} ${item.type} ${item.notes}`.toLowerCase();
      return text.includes(state.fieldSearch.trim().toLowerCase());
    });
    count.textContent = String(fields.length);
    palette.innerHTML = fields.map((item) => `
      <div class="field-card">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.type)}${item.required ? " / required" : ""}${canFieldConnect(item) ? " / connectable" : ""}</small>
        </div>
        <button type="button" class="icon-button ${used.has(item.name) ? "" : "accent"}" data-field-name="${escapeHtml(item.name)}" data-owner-id="${escapeHtml(owner.id)}" title="添加字段">
          ${used.has(item.name) ? "go" : "+"}
        </button>
      </div>
    `).join("");
  }

  function renderCanvas() {
    const layer = document.getElementById("nodeLayer");
    applyCanvasTransform();
    document.getElementById("zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;

    const file = getActiveFile();
    if (!file) {
      layer.innerHTML = `<div class="empty-canvas"><strong>mod.json</strong>这里编辑项目清单。选择 content JSON 后会显示 Class/Field 蓝图。</div>`;
      document.getElementById("wireLayer").innerHTML = "";
      return;
    }

    layer.innerHTML = file.nodes.map((node) => renderNode(file, node)).join("") + renderFieldMenu(file);
    renderWires(file);
  }

  function renderNode(file, node) {
    if (node.kind === "class") return renderClassNode(file, node);
    if (node.kind === "builtin") return renderBuiltinNode(node);
    return renderFieldNode(file, node);
  }

  function renderClassNode(file, node) {
    const selected = node.id === state.selectedNodeId ? "is-selected" : "";
    const fieldCount = file.nodes.filter((item) => item.kind === "field" && item.ownerId === node.id).length;
    const waiting = state.pendingConnection ? "is-connect-target" : "";
    return `
      <article class="node class-node ${node.role === "root" ? "root" : "local"} ${selected} ${waiting}" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px">
        <button type="button" class="class-add" data-action="open-field-menu" data-node-id="${escapeHtml(node.id)}" title="添加 Field">+</button>
        <button type="button" class="pin in" data-action="finish-connection" data-node-id="${escapeHtml(node.id)}" title="连接到这个 Class"></button>
        <div class="node-header">
          <span class="node-kind">C</span>
          <div class="node-title">
            <strong>${escapeHtml(node.className)}</strong>
            <small>${node.role === "root" ? escapeHtml(file.path) : "local class definition"}</small>
          </div>
        </div>
        <div class="node-body">
          <div class="node-row"><span>instance</span><span class="node-value">${escapeHtml(node.instanceName || node.className)}</span></div>
          <div class="node-row"><span>fields</span><span class="node-value">${fieldCount}</span></div>
          <div class="node-row"><span>accepts</span><span class="node-value">${escapeHtml(node.className)}</span></div>
        </div>
      </article>
    `;
  }

  function renderBuiltinNode(node) {
    const selected = node.id === state.selectedNodeId ? "is-selected" : "";
    return `
      <article class="node builtin-node ${selected}" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px">
        <button type="button" class="pin in" data-action="finish-connection" data-node-id="${escapeHtml(node.id)}" title="连接到这个内置实例"></button>
        <div class="node-header">
          <span class="node-kind">B</span>
          <div class="node-title">
            <strong>${escapeHtml(node.value)}</strong>
            <small>built-in ${escapeHtml(node.builtinKind)}</small>
          </div>
        </div>
        <div class="node-body">
          <div class="node-row"><span>type</span><span class="node-value">${escapeHtml(node.className)}</span></div>
          <div class="node-row"><span>value</span><span class="node-value">${escapeHtml(node.value)}</span></div>
        </div>
      </article>
    `;
  }

  function renderFieldNode(file, node) {
    const selected = node.id === state.selectedNodeId ? "is-selected" : "";
    const connected = node.connectionId ? findNode(file, node.connectionId) : null;
    const connectable = canFieldConnect(node);
    return `
      <article class="node field-node ${selected} ${state.pendingConnection?.fieldId === node.id ? "is-connecting" : ""}" data-node-id="${escapeHtml(node.id)}" style="left:${node.x}px;top:${node.y}px">
        ${connectable ? `<button type="button" class="pin out" data-action="start-connection" data-node-id="${escapeHtml(node.id)}" title="从 Field 连接到 Class / 内置实例"></button>` : ""}
        <div class="node-header">
          <span class="node-kind">F</span>
          <div class="node-title">
            <strong>${escapeHtml(node.fieldName)}</strong>
            <small>${escapeHtml(node.type)}${node.required ? " / required" : ""}</small>
          </div>
        </div>
        <div class="node-body">
          <div class="node-row"><span>value</span><span class="node-value">${escapeHtml(formatValue(node.value))}</span></div>
          <div class="node-row"><span>source</span><span class="node-value">${connected ? escapeHtml(nodeLabel(connected)) : "literal"}</span></div>
        </div>
      </article>
    `;
  }

  function renderFieldMenu(file) {
    const owner = state.fieldMenuOwnerId && findNode(file, state.fieldMenuOwnerId);
    if (!owner || owner.kind !== "class") return "";
    const used = new Set(file.nodes.filter((item) => item.kind === "field" && item.ownerId === owner.id).map((item) => item.fieldName));
    const fields = getFieldsForClass(owner.className).filter((item) => !used.has(item.name));
    return `
      <div class="field-menu" style="left:${owner.x - 286}px;top:${owner.y + 18}px">
        <div class="field-menu-header">
          <strong>${escapeHtml(owner.className)} Fields</strong>
          <button type="button" class="icon-button" data-action="close-field-menu">x</button>
        </div>
        <div class="field-menu-list">
          ${fields.length ? fields.map((item) => `
            <button type="button" data-field-name="${escapeHtml(item.name)}" data-owner-id="${escapeHtml(owner.id)}">
              <span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.type)}</small>
            </button>
          `).join("") : `<span class="field-menu-empty">没有可添加字段</span>`}
        </div>
      </div>
    `;
  }

  function renderWires(file) {
    const wireLayer = document.getElementById("wireLayer");
    const ownershipWires = file.nodes
      .filter((node) => node.kind === "field" && node.ownerId)
      .map((fieldNode) => {
        const owner = findNode(file, fieldNode.ownerId);
        if (!owner) return "";
        const sx = owner.x;
        const sy = owner.y + 43;
        const tx = fieldNode.x + NODE_WIDTH;
        const ty = fieldNode.y + 43;
        const dx = Math.max(70, Math.abs(tx - sx) * 0.4);
        const d = `M ${sx} ${sy} C ${sx - dx} ${sy}, ${tx + dx} ${ty}, ${tx} ${ty}`;
        return `<path class="wire-shadow owner" d="${d}"></path><path class="wire owner" d="${d}"></path>`;
      });

    const valueWires = file.nodes
      .filter((node) => node.kind === "field" && node.connectionId)
      .map((fieldNode) => {
        const target = findNode(file, fieldNode.connectionId);
        if (!target) return "";
        const sx = fieldNode.x + NODE_WIDTH;
        const sy = fieldNode.y + 43;
        const tx = target.x;
        const ty = target.y + 43;
        const dx = Math.max(90, Math.abs(tx - sx) * 0.45);
        const d = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
        const invalid = isConnectionCompatible(fieldNode, target) ? "" : " invalid";
        return `<path class="wire-shadow${invalid}" d="${d}"></path><path class="wire${invalid}" d="${d}"></path>`;
      });
    wireLayer.innerHTML = ownershipWires.join("") + valueWires.join("");
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

    const node = getSelectedNode() || file.nodes[0];
    state.selectedNodeId = node?.id || null;
    badge.textContent = `${file.name}.json`;

    if (node.kind === "class") {
      subtitle.textContent = node.role === "root" ? "主 Class 定义" : "局部 Class 定义";
      body.innerHTML = renderClassInspector(file, node);
    } else if (node.kind === "builtin") {
      subtitle.textContent = "内置实例";
      body.innerHTML = renderBuiltinInspector(node);
    } else {
      subtitle.textContent = `字段 ${node.fieldName}`;
      body.innerHTML = renderFieldInspector(file, node);
    }
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
        <div class="property-control"><label>说明</label><textarea data-manifest="description" rows="4">${escapeHtml(manifest.description)}</textarea></div>
      </section>
      <section class="property-group">
        <h3>项目操作</h3>
        <button type="button" class="tool-button" data-action="download-snapshot">导出项目快照</button>
      </section>
    `;
  }

  function renderClassInspector(file, node) {
    const classes = getClassNames().map((name) => `<option value="${escapeHtml(name)}" ${name === node.className ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");
    return `
      <section class="property-group">
        <h3>Class Definition</h3>
        <div class="property-control"><label>Class 类型</label><select data-node-class="${escapeHtml(node.id)}">${classes}</select></div>
        ${textControl("实例名称", node.id, node.instanceName || node.className, "instanceName")}
        ${node.role === "root" ? `
          ${textControl("文件名", "name", file.name, "fileProp")}
          <div class="property-control"><label>内容目录</label><select data-file-prop="kind">
            ${Object.keys(CLASS_KINDS).map((kind) => `<option value="${kind}" ${kind === file.kind ? "selected" : ""}>${kind}</option>`).join("")}
          </select></div>
        ` : ""}
        <div class="field-doc">${escapeHtml(TYPE_CATALOG.find((item) => item.name === node.className)?.doc || "")}</div>
      </section>
      <section class="property-group">
        <h3>操作</h3>
        <button type="button" class="tool-button" data-action="open-field-menu" data-node-id="${escapeHtml(node.id)}">添加 Field</button>
        <button type="button" class="tool-button" data-action="add-class-node">新建 Class 块</button>
        <button type="button" class="tool-button" data-action="add-builtin-node">新建内置实例</button>
        ${node.role === "root" ? `<button type="button" class="tool-button danger" data-action="delete-file">删除当前 JSON</button>` : `<button type="button" class="tool-button danger" data-action="delete-node">删除 Class 块</button>`}
      </section>
    `;
  }

  function renderBuiltinInspector(node) {
    return `
      <section class="property-group">
        <h3>Built-in Instance</h3>
        <div class="property-control"><label>目录</label><select data-builtin-kind="${escapeHtml(node.id)}">
          ${Object.keys(BUILTIN_INSTANCES).map((kind) => `<option value="${kind}" ${kind === node.builtinKind ? "selected" : ""}>${kind}</option>`).join("")}
        </select></div>
        <div class="property-control"><label>实例</label><select data-builtin-value="${escapeHtml(node.id)}">
          ${BUILTIN_INSTANCES[node.builtinKind].values.map((value) => `<option value="${escapeHtml(value)}" ${value === node.value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
        </select></div>
        <div class="property-control"><label>输出类型</label><input value="${escapeHtml(node.className)}" readonly></div>
      </section>
      <section class="property-group">
        <h3>操作</h3>
        <button type="button" class="tool-button danger" data-action="delete-node">删除内置实例</button>
      </section>
    `;
  }

  function renderFieldInspector(file, node) {
    const connected = node.connectionId ? findNode(file, node.connectionId) : null;
    const connectable = canFieldConnect(node);
    return `
      <section class="property-group">
        <h3>Field</h3>
        <div class="property-control"><label>字段名</label><input value="${escapeHtml(node.fieldName)}" readonly></div>
        <div class="property-control"><label>字段类型</label><input value="${escapeHtml(node.type)}" readonly></div>
        <div class="property-control"><label>允许连接</label><input value="${escapeHtml(acceptedTypes(node).join(", ") || "literal only")}" readonly></div>
        <div class="field-doc">${escapeHtml(node.doc || "")}</div>
      </section>
      <section class="property-group">
        <h3>值</h3>
        ${renderValueEditor(node)}
      </section>
      <section class="property-group">
        <h3>连接</h3>
        <div class="field-doc">${connected ? `已连接到 ${escapeHtml(nodeLabel(connected))}` : connectable ? "点击字段块右侧圆点，再点击 Class / 内置实例左侧圆点。" : "这个字段是字面量，不需要连接。"}</div>
        ${connectable ? `
          <button type="button" class="tool-button" data-action="create-class-for-field">新建 Class 并连接</button>
          <button type="button" class="tool-button" data-action="create-builtin-for-field">新建内置实例并连接</button>
          <button type="button" class="tool-button" data-action="clear-connection">断开连接</button>
        ` : ""}
      </section>
      <section class="property-group">
        <h3>节点操作</h3>
        <button type="button" class="tool-button danger" data-action="delete-node">删除 Field</button>
      </section>
    `;
  }

  function renderValueEditor(node) {
    if (node.type === "Boolean") {
      return `<div class="toggle-row"><span>${node.value === "true" ? "true" : "false"}</span><button type="button" class="toggle ${node.value === "true" ? "is-on" : ""}" data-action="toggle-field-boolean" aria-label="切换布尔值"></button></div>`;
    }
    if (["Int", "Float"].includes(node.type)) {
      return `<div class="property-control"><label>数值</label><input type="number" step="${node.type === "Int" ? "1" : "0.01"}" value="${escapeHtml(node.value)}" data-field-value="value"></div>`;
    }
    if (node.type === "Color") {
      const color = /^#[0-9a-f]{6}$/i.test(node.value) ? node.value : "#42d190";
      return `<div class="property-control"><label>颜色</label><input type="color" value="${escapeHtml(color)}" data-field-value="value"></div><div class="property-control"><label>颜色文本</label><input value="${escapeHtml(node.value)}" data-field-value="value"></div>`;
    }
    if (node.type.startsWith("Array") || node.type === "Object") {
      return `<div class="property-control"><label>${node.type === "Object" ? "对象 JSON" : "数组，每行或逗号分隔一项"}</label><textarea rows="5" data-field-value="value">${escapeHtml(node.value)}</textarea></div>`;
    }
    return `<div class="property-control"><label>文本</label><input value="${escapeHtml(node.value)}" data-field-value="value"></div>`;
  }

  function textControl(label, key, value, kind) {
    const attr = kind === "manifest" ? `data-manifest="${key}"` : kind === "instanceName" ? `data-instance-name="${key}"` : `data-file-prop="${key}"`;
    return `<div class="property-control"><label>${escapeHtml(label)}</label><input value="${escapeHtml(value || "")}" ${attr}></div>`;
  }

  function startConnection(fieldId) {
    const file = getActiveFile();
    const node = file && findNode(file, fieldId);
    if (!node || node.kind !== "field" || !canFieldConnect(node)) return;
    state.pendingConnection = { fieldId };
    state.selectedNodeId = fieldId;
    addLog("connect", `选择目标 Class / 内置实例：${node.fieldName}`);
    renderAll();
  }

  function finishConnection(targetId) {
    const file = getActiveFile();
    if (!file || !state.pendingConnection) return;
    const fieldNode = findNode(file, state.pendingConnection.fieldId);
    const target = findNode(file, targetId);
    if (!fieldNode || !target || !["class", "builtin"].includes(target.kind)) return;

    if (!isConnectionCompatible(fieldNode, target)) {
      const message = `${fieldNode.fieldName}(${fieldNode.type}) 不能连接到 ${nodeLabel(target)}(${target.className})`;
      addLog("connect", message);
      state.problems.push(problem("error", "canvas", message));
      state.pendingConnection = null;
      renderAll();
      return;
    }

    fieldNode.connectionId = target.id;
    state.pendingConnection = null;
    state.selectedNodeId = fieldNode.id;
    addLog("connect", `${fieldNode.fieldName} 已连接到 ${nodeLabel(target)}`);
    renderAll();
  }

  function clearSelectedConnection() {
    const node = getSelectedNode();
    if (!node || node.kind !== "field") return;
    node.connectionId = null;
    state.pendingConnection = null;
    renderAll();
  }

  function createClassForSelectedField() {
    const fieldNode = getSelectedNode();
    const file = getActiveFile();
    if (!fieldNode || fieldNode.kind !== "field" || !file) return;
    const className = firstAcceptedClass(fieldNode) || "Block";
    const node = addClassNode(className, fieldNode.x + 380, fieldNode.y - 8);
    if (node && isConnectionCompatible(fieldNode, node)) fieldNode.connectionId = node.id;
    state.selectedNodeId = fieldNode.id;
    renderAll();
  }

  function createBuiltinForSelectedField() {
    const fieldNode = getSelectedNode();
    const file = getActiveFile();
    if (!fieldNode || fieldNode.kind !== "field" || !file) return;
    const builtinKind = firstAcceptedBuiltinKind(fieldNode) || "blocks";
    const node = addBuiltinNode(builtinKind, fieldNode.x + 380, fieldNode.y - 8);
    if (node && isConnectionCompatible(fieldNode, node)) fieldNode.connectionId = node.id;
    state.selectedNodeId = fieldNode.id;
    renderAll();
  }

  function canFieldConnect(node) {
    return acceptedTypes(node).length > 0;
  }

  function acceptedTypes(node) {
    if (!node) return [];
    if (node.accepts?.length) return node.accepts;
    if (node.type === "Object" || node.type === "Array<Object>") return ["Object"];
    if (node.type === "Array<ItemStack>") return ["Item"];
    if (getClassNames().includes(node.type)) return [node.type];
    return [];
  }

  function isConnectionCompatible(fieldNode, target) {
    if (!fieldNode || !target || !canFieldConnect(fieldNode)) return false;
    const accepts = acceptedTypes(fieldNode);
    if (accepts.includes("Object")) return target.kind === "class";
    return accepts.some((accepted) => typeExtends(target.className, accepted));
  }

  function typeExtends(candidate, expected) {
    if (candidate === expected) return true;
    let current = TYPE_CATALOG.find((item) => item.name === candidate);
    while (current?.parentType) {
      if (current.parentType === expected) return true;
      current = TYPE_CATALOG.find((item) => item.name === current.parentType);
    }
    return false;
  }

  function firstAcceptedClass(fieldNode) {
    const accepts = acceptedTypes(fieldNode);
    if (accepts.includes("Object")) return "Block";
    return accepts.find((name) => getClassNames().includes(name)) || null;
  }

  function firstAcceptedBuiltinKind(fieldNode) {
    const accepts = acceptedTypes(fieldNode);
    return Object.entries(BUILTIN_INSTANCES).find(([, meta]) => accepts.some((accepted) => typeExtends(meta.className, accepted)))?.[0] || null;
  }

  function removeInvalidFieldConnections(file, ownerId) {
    file.nodes.filter((node) => node.kind === "field" && node.ownerId === ownerId).forEach((node) => {
      const target = node.connectionId && findNode(file, node.connectionId);
      if (target && !isConnectionCompatible(node, target)) node.connectionId = null;
    });
  }

  function renderDockTabs() {
    document.querySelectorAll("[data-dock-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.dockTab === state.dockTab);
    });
  }

  function renderDock() {
    const body = document.getElementById("dockBody");
    if (state.dockTab === "json") {
      body.innerHTML = `<pre class="code-preview">${escapeHtml(JSON.stringify(getActiveJson(), null, 2))}</pre>`;
      return;
    }

    if (state.dockTab === "problems") {
      const problems = state.problems.length ? state.problems : [{ level: "ok", scope: "project", message: "当前没有发现问题。" }];
      body.innerHTML = `<ul class="problem-list">${problems.map((item) => `<li class="problem-item ${escapeHtml(item.level)}"><strong>${escapeHtml(item.level)}</strong><span>${escapeHtml(item.scope)}：${escapeHtml(item.message)}</span></li>`).join("")}</ul>`;
      return;
    }

    if (state.dockTab === "logs") {
      body.innerHTML = `<ul class="log-list">${state.logs.slice(-80).reverse().map((item) => `<li class="log-item"><strong>${escapeHtml(item.level)}</strong><span>${escapeHtml(item.message)} <small>${escapeHtml(item.time)}</small></span></li>`).join("")}</ul>`;
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
        ${steps.map((item) => `<li class="package-item ${item.status === "done" ? "done" : ""}"><strong>${escapeHtml(item.status)}</strong><span>${escapeHtml(item.name)} <small>${escapeHtml(item.note || "")}</small></span></li>`).join("")}
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
    const root = file.nodes.find((node) => node.kind === "class" && node.role === "root");
    return root ? buildClassJson(file, root) : {};
  }

  function buildClassJson(file, classNode) {
    const json = { type: classNode.className };
    file.nodes.filter((node) => node.kind === "field" && node.ownerId === classNode.id).forEach((node) => {
      json[node.fieldName] = coerceValue(file, node);
    });
    return json;
  }

  function coerceValue(file, node) {
    const connected = node.connectionId ? findNode(file, node.connectionId) : null;
    if (connected) {
      if (connected.kind === "builtin") return connectedValueForField(node, connected);
      if (connected.kind === "class") {
        const nested = buildClassJson(file, connected);
        return node.type.startsWith("Array") ? [nested] : nested;
      }
    }

    const value = String(node.value || "").trim();
    if (node.type === "Boolean") return value === "true";
    if (node.type === "Int") return Number.parseInt(value || "0", 10);
    if (node.type === "Float") return Number.parseFloat(value || "0");
    if (node.type === "Object") {
      try { return JSON.parse(value || "{}"); } catch (_) { return {}; }
    }
    if (node.type.startsWith("Array")) {
      return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).map((item) => {
        if (node.type === "Array<ItemStack>" && item.includes("/")) {
          const [name, amount] = item.split("/");
          return { item: name.trim(), amount: Number.parseInt(amount, 10) || 0 };
        }
        return item;
      });
    }
    return value;
  }

  function connectedValueForField(fieldNode, builtinNode) {
    if (fieldNode.type === "Array<ItemStack>") return [{ item: builtinNode.value, amount: 1 }];
    if (fieldNode.type.startsWith("Array")) return [builtinNode.value];
    return builtinNode.value;
  }

  function validateProject() {
    const problems = [];
    if (!state.project) return problems;
    const manifest = state.project.manifest;
    if (!manifest.name) problems.push(problem("error", "mod.json", "缺少 name。"));
    if (!/^[a-z0-9._-]+$/.test(manifest.name)) problems.push(problem("error", "mod.json", "name 只能包含小写字母、数字、点、下划线和短横线。"));

    const paths = new Set();
    state.project.files.forEach((file) => {
      if (paths.has(file.path)) problems.push(problem("error", file.path, "文件路径重复。"));
      paths.add(file.path);

      file.nodes.filter((node) => node.kind === "class").forEach((classNode) => {
        const fields = file.nodes.filter((node) => node.kind === "field" && node.ownerId === classNode.id);
        getFieldsForClass(classNode.className).filter((item) => item.required).forEach((requiredField) => {
          const node = fields.find((item) => item.fieldName === requiredField.name);
          if (!node || String(node.value || "").trim() === "") problems.push(problem("warning", file.path, `${classNode.className} 建议填写 ${requiredField.name}。`));
        });
      });

      file.nodes.filter((node) => node.kind === "field").forEach((node) => {
        if (node.connectionId) {
          const target = findNode(file, node.connectionId);
          if (!target || !isConnectionCompatible(node, target)) problems.push(problem("error", file.path, `${node.fieldName} 连接类型不匹配。`));
        }
        if (["Int", "Float"].includes(node.type) && Number.isNaN(Number(node.value))) problems.push(problem("error", file.path, `${node.fieldName} 需要是数字。`));
        if (node.type === "Object" && !node.connectionId) {
          try { JSON.parse(node.value || "{}"); } catch (_) { problems.push(problem("error", file.path, `${node.fieldName} 不是合法对象 JSON。`)); }
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
    if (!hasError) state.api.request("PackageMod", getPackagePlan());
    renderAll();
  }

  function getPackagePlan() {
    if (!state.project) return { fileCount: 0, files: {} };
    const files = { "mod.json": getManifestJson() };
    state.project.files.forEach((file) => { files[file.path] = buildJsonForFile(file); });
    return { modName: state.project.manifest.name, fileCount: Object.keys(files).length, files, assets: state.project.assets };
  }

  function saveProject() {
    if (!state.project) return;
    state.project.updatedAt = new Date().toISOString();
    localStorage.setItem("mindustrymit.visual-editor.project", JSON.stringify({ version: 2, project: state.project }));
    state.api.request("SaveProject", { Project: state.project });
    addLog("project", "项目已保存到浏览器本地缓存");
    renderDock();
  }

  function downloadProjectSnapshot() {
    download(`${state.project.manifest.name}-project.json`, JSON.stringify({ version: 2, project: state.project }, null, 2), "application/json");
  }

  function downloadCurrentJson() {
    const file = getActiveFile();
    download(file ? `${file.name}.json` : "mod.json", JSON.stringify(getActiveJson(), null, 2), "application/json");
  }

  function downloadPackagePlan() {
    download(`${state.project.manifest.name}-package-plan.json`, JSON.stringify(getPackagePlan(), null, 2), "application/json");
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

  function importJsonAsContent(data, name) {
    if (!state.project) createProject({ name: "imported-mod", displayName: "Imported Mod", starterKind: "blocks" });
    const className = data.type || "Block";
    const kind = className === "Item" ? "items" : className === "Liquid" ? "liquids" : className === "UnitType" ? "units" : "blocks";
    const file = createContentFile(kind, className, name.replace(/\.json$/i, ""));
    const root = file.nodes.find((node) => node.kind === "class" && node.role === "root");
    file.nodes = [root];
    Object.entries(data).forEach(([key, value]) => {
      if (key === "type") return;
      const meta = getFieldsForClass(className).find((item) => item.name === key) || field(key, inferType(value), stringifyImportedValue(value), "导入字段");
      const node = addFieldNode(file, root.id, meta);
      node.value = stringifyImportedValue(value);
    });
    state.activeFileId = file.id;
    state.selectedNodeId = root.id;
  }

  function inferType(value) {
    if (typeof value === "boolean") return "Boolean";
    if (typeof value === "number") return Number.isInteger(value) ? "Int" : "Float";
    if (Array.isArray(value)) return "Array<Object>";
    if (value && typeof value === "object") return "Object";
    return "String";
  }

  function stringifyImportedValue(value) {
    if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join("\n");
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value ?? "");
  }

  function deleteSelectedNode() {
    const file = getActiveFile();
    const node = getSelectedNode();
    if (!file || !node) return;
    if (node.kind === "class" && node.role === "root") return;

    if (node.kind === "class") {
      file.nodes = file.nodes.filter((item) => item.id !== node.id && item.ownerId !== node.id);
      file.nodes.forEach((item) => { if (item.connectionId === node.id) item.connectionId = null; });
    } else {
      file.nodes = file.nodes.filter((item) => item.id !== node.id);
      file.nodes.forEach((item) => { if (item.connectionId === node.id) item.connectionId = null; });
    }
    state.selectedNodeId = file.nodes[0]?.id || null;
    renderAll();
  }

  function deleteActiveFile() {
    const file = getActiveFile();
    if (!file) return;
    state.project.files = state.project.files.filter((item) => item.id !== file.id);
    state.activeFileId = state.project.files[0]?.id || "manifest";
    state.selectedNodeId = getActiveFile()?.nodes[0]?.id || null;
    renderAll();
  }

  function toggleSelectedBoolean() {
    const node = getSelectedNode();
    if (!node || node.kind !== "field" || node.type !== "Boolean") return;
    node.value = node.value === "true" ? "false" : "true";
    renderAll();
  }

  function openProjectModal() {
    document.getElementById("projectModal").classList.remove("hidden");
  }

  function closeProjectModal() {
    document.getElementById("projectModal").classList.add("hidden");
  }

  function migrateProject(project) {
    project.files.forEach((file) => {
      const root = file.nodes.find((node) => node.kind === "class" && node.role === "root")
        || file.nodes.find((node) => node.kind === "root");
      if (root && root.kind === "root") {
        root.kind = "class";
        root.role = "root";
        root.className = file.className || root.className || root.title || "Block";
        root.instanceName = file.name;
      }
      file.nodes.filter((node) => node.kind === "field" && !node.ownerId).forEach((node) => { node.ownerId = root?.id; });
    });
    return project;
  }

  function getActiveFile() {
    if (!state.project || state.activeFileId === "manifest") return null;
    return state.project.files.find((file) => file.id === state.activeFileId) || null;
  }

  function getSelectedNode() {
    const file = getActiveFile();
    return file ? findNode(file, state.selectedNodeId) : null;
  }

  function findNode(file, nodeId) {
    return file?.nodes.find((node) => node.id === nodeId) || null;
  }

  function placeNode(node) {
    const element = document.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
    if (!element) return;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
  }

  function applyCanvasTransform() {
    const world = document.getElementById("canvasWorld");
    const viewport = document.getElementById("canvasViewport");
    if (!world || !viewport) return;
    world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    viewport.style.backgroundPosition = `${state.panX}px ${state.panY}px, ${state.panX}px ${state.panY}px, center, center`;
  }

  function nodeLabel(node) {
    if (!node) return "";
    if (node.kind === "builtin") return `${node.builtinKind}/${node.value}`;
    if (node.kind === "class") return `${node.instanceName || node.className}:${node.className}`;
    return node.fieldName;
  }

  function getClassNames() {
    return state.classes.length ? state.classes : TYPE_CATALOG.map((item) => item.name);
  }

  function addLog(level, message) {
    state.logs.push({ level, message, time: new Date().toLocaleTimeString() });
    if (state.logs.length > 160) state.logs.shift();
    if (state.dockTab === "logs" && document.getElementById("dockBody")) renderDock();
  }

  function uniqueFileName(kind, base) {
    const clean = slugify(base || "content");
    let candidate = clean;
    let index = 2;
    while (state.project.files.some((file) => file.kind === kind && file.name === candidate)) {
      candidate = `${clean}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function slugify(value) {
    const slug = String(value || "").trim().toLowerCase().replace(/\.json$/i, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || "content";
  }

  function toTitle(value) {
    return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatValue(value) {
    const text = String(value ?? "");
    return text.length > 30 ? `${text.slice(0, 27)}...` : text || "null";
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function cssEscape(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
