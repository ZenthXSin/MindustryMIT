window.tailwind = window.tailwind || {};
window.tailwind.config = {
    darkMode: 'class',
    theme: { extend: { colors: { idea: {
                    bg: '#1e1e1e', panel: '#252526', card: '#2d2d30', border: '#3e3e42', borderDark: '#1e1e1e',
                    text: '#cccccc', textMuted: '#858585', keyword: '#569cd6', string: '#ce9178',
                    number: '#b5cea8', field: '#9cdcfe', button: '#0e639c', buttonHover: '#1177bb',
                    hover: '#2a2d2e', selection: '#04395e', danger: '#f14c4c', dangerHover: '#d13c3c'
                }}}}
};

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. 本地化数据引擎 (DictManager)
    // ==========================================
    localforage.config({ name: 'MindustryVS' }); // 全局设置
    const i18nStore = localforage.createInstance({ name: 'MindustryVS', storeName: 'i18n_dict', description: '存储类、字段、实例的本地化名称与文档' });
    
    class DictManager {
        constructor() { this._cache = new Map(); this._loaded = false; this._loading = null; }
        async _ensureLoaded() {
            if (this._loaded) return; if (this._loading) return this._loading;
            this._loading = (async () => {
                try {
                    await i18nStore.ready();
                    const dbName = i18nStore._dbInfo.name; const storeName = i18nStore._dbInfo.storeName;
                    const db = await new Promise((resolve, reject) => { const req = indexedDB.open(dbName); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
                    const tx = db.transaction(storeName, 'readonly'); const store = tx.objectStore(storeName);
                    const [keys, values] = await Promise.all([
                        new Promise((res, rej) => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
                        new Promise((res, rej) => { const r = store.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })
                    ]);
                    for (let i = 0; i < keys.length; i++) this._cache.set(keys[i], values[i]); db.close();
                } catch (e) { await i18nStore.iterate((value, key) => { this._cache.set(key, value); }); }
                this._loaded = true; this._loading = null;
            })(); return this._loading;
        }
        async get(key) { await this._ensureLoaded(); return this._cache.get(key) ?? null; }
        async set(key, value) {
            let safeValue = (value === null || value === undefined) ? "" : String(value).trim(); if (safeValue === "null") safeValue = ""; this._cache.set(key, safeValue);
            try { await i18nStore.setItem(key, safeValue); } catch (e) {} return safeValue;
        }
        async isEmpty() { await this._ensureLoaded(); return this._cache.size === 0; }
        async exportJSON() { await this._ensureLoaded(); const dict = {}; for (const [k, v] of this._cache) dict[k] = v; return JSON.stringify(dict, null, 2); }
        async importJSON(jsonString, onProgress) {
            try {
                const dict = JSON.parse(jsonString); const entries = Object.entries(dict); const total = entries.length;
                for (const [key, value] of entries) { let sv = (value === null || value === undefined) ? "" : String(value).trim(); if (sv === "null") sv = ""; this._cache.set(key, sv); }
                this._loaded = true; const segments = {};
                for (const [k, v] of entries) { const prefix = k.split('.')[0] || 'Other'; if (!segments[prefix]) segments[prefix] = []; segments[prefix].push([k, v]); }
                let done = 0;
                await Promise.all(Object.keys(segments).map(async prefix => {
                    const seg = segments[prefix]; const BATCH = 500;
                    for (let i = 0; i < seg.length; i += BATCH) {
                        const batch = seg.slice(i, i + BATCH);
                        await Promise.all(batch.map(([k, v]) => { let sv = (v === null || v === undefined) ? "" : String(v).trim(); if (sv === "null") sv = ""; return i18nStore.setItem(k, sv); }));
                        done += batch.length; if (onProgress) onProgress(Math.round(done / total * 100));
                    }
                })); return true;
            } catch (e) { return false; }
        }
    }
    const i18n = new DictManager();

    // ==========================================
    // 1b. 权重包管理器 (WeightManager)
    // ==========================================
    const weightStore = localforage.createInstance({ name: 'MindustryVS', storeName: 'weight_pack', description: '存储类和字段的排序权重' });
    class WeightManager {
        async get(key) { return await weightStore.getItem(key); }
        async set(key, value) { const num = Number(value); await weightStore.setItem(key, isNaN(num) ? 0 : num); }
        async isEmpty() { let empty = true; await weightStore.iterate(() => { empty = false; return true; }); return empty; }
        async exportJSON() { const pack = {}; await weightStore.iterate((value, key) => { pack[key] = value; }); return JSON.stringify(pack, null, 2); }
        async importJSON(jsonString, onProgress) {
            try { const pack = JSON.parse(jsonString); const entries = Object.entries(pack); const total = entries.length; for (let i = 0; i < total; i++) { const [key, value] = entries[i]; await this.set(key, value); if (onProgress) onProgress(Math.round(((i + 1) / total) * 100)); } return true; } catch (e) { return false; }
        }
        async getClassWeight(className) { const w = await this.get(`Class.${className}.weight`); return w != null ? Number(w) : 0; }
        async getFieldWeight(className, fieldName) { const w = await this.get(`Field.${className}.${fieldName}.weight`); return w != null ? Number(w) : 0; }
    }
    const weightMgr = new WeightManager();

    // ==========================================
    // 1c. Schema 管理器 (SchemaManager)
    // ==========================================
    const schemaClassStore = localforage.createInstance({ name: 'MindustryVS', storeName: 'schema_classes', description: '存储自定义的 Class' });
    const schemaFieldStore = localforage.createInstance({ name: 'MindustryVS', storeName: 'schema_fields', description: '存储扩展的 Field' });
    class SchemaManager {
        async getClasses() { const schemas = {}; await schemaClassStore.iterate((value, key) => { schemas[key] = value; }); return schemas; }
        async saveClass(className, definition) { const rawDef = JSON.parse(JSON.stringify(definition)); await schemaClassStore.setItem(className, rawDef); }
        async removeClass(className) { await schemaClassStore.removeItem(className); }
        async getFields() { const fields = []; await schemaFieldStore.iterate((value, key) => { fields.push(value); }); return fields; }
        async saveField(fieldDef) { const rawDef = JSON.parse(JSON.stringify(fieldDef)); await schemaFieldStore.setItem(fieldDef.id, rawDef); }
        async removeField(id) { await schemaFieldStore.removeItem(id); }
        async exportJSON() { return JSON.stringify({ classes: await this.getClasses(), fields: await this.getFields() }, null, 2); }
        async importJSON(jsonString) {
            try { const pack = JSON.parse(jsonString); if (pack.classes) for (const [key, value] of Object.entries(pack.classes)) await this.saveClass(key, value); if (pack.fields) for (const f of pack.fields) await this.saveField(f); return true; } catch (e) { return false; }
        }
        async syncToBackend(wsApi) {
            const classes = await this.getClasses(); let classCount = 0; let fieldCount = 0;
            for (const [className, def] of Object.entries(classes)) {
                try { await wsApi.send('DefineClass', { Class_Name: className, Parent_Type: def.parentType || 'Object', Fields: def.fields || [] }); classCount++; } catch (e) { console.warn(`同步自定义类 ${className} 失败:`, e); }
            }
            const fields = await this.getFields();
            for (const f of fields) {
                try { await wsApi.send('AddField', { Class_Name: f.targetClass, Field_Name: f.fieldName, Field_Type: f.fieldType, Default_Value: f.defaultValue || '', Notes: f.notes || '', Apply_To_Subclasses: f.applyToSubclasses || false }); fieldCount++; } catch (e) { console.warn(`同步扩展字段 ${f.targetClass}.${f.fieldName} 失败:`, e); }
            }
            return { classCount, fieldCount };
        }
    }
    const schemaMgr = new SchemaManager();

    // ==========================================
    // 1d. 本地项目管理器 (ProjectManager)
    // ==========================================
    const projectStore = localforage.createInstance({ name: 'MindustryVS', storeName: 'local_projects', description: '本地保存的项目实例' });

    // ==========================================
    // 2. WebSocket 客户端
    // ==========================================
    const isMobileDevice = () => window.innerWidth <= 768 || 'ontouchstart' in window;
    class MindustryWSClient {
        constructor() { this.ws = null; this.resolvers = {}; this.typeQueues = {}; }
        connect(url) {
            this.closeSilently();
            return new Promise((resolve, reject) => {
                let settled = false;
                try { this.ws = new WebSocket(url); } catch (e) { return reject(new Error('WebSocket 初始化失败: ' + e.message)); }
                const socket = this.ws;
                socket.onopen = () => { settled = true; console.log("[WS] 连接成功"); resolve(); };
                socket.onmessage = (e) => { if (socket === this.ws) this.handleMessage(e.data); };
                socket.onerror = () => { if (!settled) { settled = true; reject(new Error('无法连接到服务器，请检查地址和端口是否正确')); } };
                socket.onclose = () => {
                    if (socket !== this.ws) return;
                    this.ws = null; this.rejectAllPendingRequests('连接已断开'); this.resetQueues('连接已断开');
                    window.dispatchEvent(new CustomEvent('ws-close'));
                    if (!settled) { settled = true; reject(new Error('连接已断开')); }
                };
            });
        }
        closeSilently() {
            if (!this.ws) return;
            const old = this.ws; this.ws = null;
            old.onopen = old.onmessage = old.onerror = old.onclose = null;
            if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) old.close();
            this.rejectAllPendingRequests('连接已重置'); this.resetQueues('连接已重置');
        }
        handleMessage(rawData) {
            try {
                const response = JSON.parse(rawData); const { wsType, dataList } = response; const parsedData = this.parseDataList(dataList);
                if (wsType === 'Error') {
                    const errMsg = parsedData?.Message || rawData; window.dispatchEvent(new CustomEvent('ws-error', { detail: errMsg }));
                    const pendingType = Object.keys(this.resolvers).find(type => this.resolvers[type] && this.resolvers[type].length > 0);
                    if (pendingType) this.resolvers[pendingType].shift().reject(new Error(errMsg)); return;
                }
                if (this.resolvers[wsType] && this.resolvers[wsType].length > 0) this.resolvers[wsType].shift().resolve(parsedData);
            } catch (error) {}
        }
        send(wsType, contentObj = null) {
            if (!this.typeQueues[wsType]) this.typeQueues[wsType] = Promise.resolve();
            const run = () => this.sendNow(wsType, contentObj);
            const queued = this.typeQueues[wsType].then(run, run);
            this.typeQueues[wsType] = queued.catch(() => {});
            return queued;
        }
        sendNow(wsType, contentObj = null) {
            return new Promise((resolve, reject) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('WebSocket 未连接'));
                const payload = { wsType }; if (contentObj) payload.content = JSON.stringify(contentObj);
                if (!this.resolvers[wsType]) this.resolvers[wsType] = []; this.resolvers[wsType].push({ resolve, reject }); this.ws.send(JSON.stringify(payload));
            });
        }
        rejectAllPendingRequests(reason) { Object.keys(this.resolvers).forEach(wsType => { while (this.resolvers[wsType].length > 0) this.resolvers[wsType].shift().reject(new Error(reason)); }); }
        resetQueues(reason) { Object.keys(this.typeQueues).forEach(wsType => { this.typeQueues[wsType] = Promise.reject(new Error(reason)).catch(() => {}); }); }
        parseDataList(dataObj) {
            if (dataObj === null || dataObj === undefined) return null; if (typeof dataObj !== 'object') return dataObj;
            if (Array.isArray(dataObj)) return dataObj.map(item => this.parseDataList(item));
            const keys = Object.keys(dataObj);
            if (keys.length === 1) {
                const k = keys[0]; if (['str', 'int', 'float', 'boolean', 'json', 'long', 'double', 'short', 'byte'].includes(k)) return dataObj[k];
                if (k === 'list') return dataObj.list.map(item => this.parseDataList(item)); if (k === 'obj') return this.parseDataList(dataObj.obj);
            }
            const result = {}; for (const key in dataObj) result[key] = this.parseDataList(dataObj[key]); return result;
        }
    }
    const wsApi = new MindustryWSClient();

    // ==========================================
    // 3. 数据提供者 (DataProvider)
    // ==========================================
    const parentClassCache = {};
    async function buildParentClassMap() {
        try {
            const res = await wsApi.send('AllClass'); const allClasses = (res.Class_List || []).map(c => typeof c === 'string' ? c : (c.str || String(c)));
            const tasks = allClasses.map(async cls => { try { const subRes = await wsApi.send('AllClass', { Parent_Class: cls }); const subs = (subRes.Class_List || []).map(c => typeof c === 'string' ? c : (c.str || String(c))); for (const sub of subs) { if (sub !== cls && !parentClassCache[sub]) parentClassCache[sub] = cls; } } catch (e) {} });
            for (let i = 0; i < tasks.length; i += 20) await Promise.all(tasks.slice(i, i + 20));
        } catch (e) {}
    }
    const DataProvider = {
        getParentClass(className) { return parentClassCache[className] || ""; },
        async getClassDoc(className) { if (!className) return ""; const localDoc = await i18n.get(`Class.${className}.doc`); return (localDoc && localDoc !== "null") ? localDoc : ""; },
        async getFieldDoc(className, fieldName) {
            if (!className || !fieldName) return ""; let localDoc = await i18n.get(`Field.${className}.${fieldName}.doc`); if (localDoc && localDoc !== "null") return localDoc;
            let cur = className; for (let depth = 0; depth < 10; depth++) { const parent = await this.getParentClass(cur); if (!parent) break; localDoc = await i18n.get(`Field.${parent}.${fieldName}.doc`); if (localDoc && localDoc !== "null") return localDoc; cur = parent; }
            let docStr = ""; try { const res = await wsApi.send('FieldDoc', { Class_Name: className, Field_Name: fieldName }); if (res && res.Field_Doc) docStr = typeof res.Field_Doc === 'string' ? res.Field_Doc : (res.Field_Doc.str || ""); } catch (e) {}
            if (docStr) await i18n.set(`Field.${className}.${fieldName}.doc`, docStr); return docStr;
        },
        async getDisplayName(type, parentName, originalName) {
            let dictKey = ""; if (type === 'Class') dictKey = `Class.${originalName}.name`; else if (type === 'Field') dictKey = `Field.${parentName}.${originalName}.name`; else if (type === 'Instance') dictKey = `Instance.${parentName}.${originalName}.name`; else return originalName;
            let localName = await i18n.get(dictKey); if (localName && localName !== "null") return localName;
            if (type === 'Field' && parentName) { let cur = parentName; for (let depth = 0; depth < 10; depth++) { const parent = await this.getParentClass(cur); if (!parent) break; localName = await i18n.get(`Field.${parent}.${originalName}.name`); if (localName && localName !== "null") { await i18n.set(dictKey, localName); return localName; } cur = parent; } }
            if (type === 'Field') { const readable = originalName.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim(); await i18n.set(dictKey, readable); return readable; } return originalName;
        }
    };
    const classInstanceCache = {};
    async function fetchClassInstances(typeName) {
        if (!typeName || typeName === '' || typeName === 'String' || typeName === 'str') return []; if (classInstanceCache[typeName] !== undefined) return classInstanceCache[typeName];
        try { const res = await wsApi.send('ClassInstance', { Class_Name: typeName }); const list = res.Object_List ? res.Object_List.map(item => typeof item === 'string' ? item : (item.str || String(item))) : []; const richList = await Promise.all(list.map(async name => { const displayName = await DataProvider.getDisplayName('Instance', typeName, name); return { name, displayName }; })); classInstanceCache[typeName] = richList; return richList; } catch (e) { classInstanceCache[typeName] = []; return []; }
    }
    async function fetchAllTypes(typeName) { if (!typeName || typeName === '' || typeName === 'String' || typeName === 'str') return []; try { const res = await wsApi.send('AllClass', { Parent_Class: typeName }); return res.Class_List ? res.Class_List.map(item => typeof item === 'string' ? item : (item.str || String(item))) : []; } catch (e) { return []; } }
    function isBasicType(typeName) { const basics = ['int', 'float', 'double', 'long', 'short', 'byte', 'boolean', 'String', 'str', 'char']; return !typeName || basics.includes(typeName) || basics.some(b => typeName.endsWith('.' + b)); }

    function parseTypeInfo(typeName) {
        if (!typeName) return { isArray: false, elementType: null, baseType: 'String' };
        if (typeName.startsWith('[L') && typeName.endsWith(';')) { const et = typeName.slice(2, -1); return { isArray: true, elementType: et, baseType: et }; }
        if (typeName.endsWith('[]')) { const et = typeName.slice(0, -2); return { isArray: true, elementType: et, baseType: et }; }
        if (/^\[[IFZBSJDC]$/.test(typeName)) { const map = { 'I': 'int', 'F': 'float', 'Z': 'boolean', 'B': 'byte', 'S': 'short', 'J': 'long', 'D': 'double', 'C': 'char' }; const et = map[typeName[1]] || 'Object'; return { isArray: true, elementType: et, baseType: et }; }
        return { isArray: false, elementType: null, baseType: typeName };
    }

    class StepRecorder {
        constructor() { this.steps = []; } record(step) { this.steps.push({ ...step, timestamp: Date.now() }); } getSteps() { return this.steps; } clear() { this.steps = []; } exportJson() { return JSON.stringify({ version: "1.0", steps: this.steps }, null, 2); }
        optimizeSteps(steps) {
            const optimized = []; const classCreations = new Set(); const setValues = new Map(); const removes = new Map();
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                switch (step.type) {
                    case 'NewClass': if (!classCreations.has(step.classId)) { classCreations.add(step.classId); optimized.push(step); } break;
                    case 'SetFieldValue': { const key = `${step.classId}:${step.path.join('.')}`; if (removes.has(key)) { optimized[removes.get(key)] = null; removes.delete(key); } if (setValues.has(key)) { optimized[setValues.get(key)] = null; } setValues.set(key, optimized.length); optimized.push(step); break; }
                    case 'AddElement': optimized.push(step); break;
                    case 'RemoveElement': { const key = `${step.classId}:${step.path.join('.')}`; removes.set(key, optimized.length); optimized.push(step); break; }
                    default: optimized.push(step);
                }
            } return optimized.filter(s => s !== null);
        }
        async replay(steps, wsApi, onProgress) {
            const optimizedSteps = this.optimizeSteps(steps); const idMap = {}; const pathMap = {}; const classIdToGlobalPath = {}; const getRealId = (id) => (idMap[id] !== undefined ? idMap[id] : id);
            console.log('[replay] 原始步骤数:', steps.length, '优化后步骤数:', optimizedSteps.length);
            const firstNewClass = optimizedSteps.find(s => s.type === 'NewClass'); if (firstNewClass) classIdToGlobalPath[firstNewClass.classId] = [];
            for (let i = 0; i < optimizedSteps.length; i++) {
                const step = optimizedSteps[i];
                switch (step.type) {
                    case 'NewClass': { const res = await wsApi.send('NewClass', { Class_Name: step.className }); let newId = res.Class_Id; if (typeof newId === 'object' && newId !== null) newId = Object.values(newId)[0]; idMap[step.classId] = newId; this.record({ type: 'NewClass', className: step.className, classId: newId }); console.log('[replay] NewClass', step.className, '旧ID:', step.classId, '→ 新ID:', newId, '原始res.Class_Id:', res.Class_Id); break; }
                    case 'SetFieldValue': { const classId = getRealId(step.classId); const path = step.path.map(p => getRealId(p)); if (step.valueClassId !== undefined && step.valueClassId !== null) { const realValId = getRealId(step.valueClassId); await wsApi.send('SetFieldValue', { Class_Id: classId, Field_Path: path, Value_Class_Id: realValId }); const parentPath = classIdToGlobalPath[step.classId] || []; const currentPath = [...parentPath, ...step.path]; classIdToGlobalPath[step.valueClassId] = currentPath; pathMap[currentPath.join('.')] = realValId; this.record({ type: 'SetFieldValue', classId, path, valueClassId: realValId }); console.log('[replay] SetFieldValue(subclass)', path, '→ classId:', realValId); } else { await wsApi.send('SetFieldValue', { Class_Id: classId, Field_Path: path, Value: step.value }); this.record({ type: 'SetFieldValue', classId, path, value: step.value }); console.log('[replay] SetFieldValue(value)', path, '=', step.value); } break; }
                    case 'AddElement': { const classId = getRealId(step.classId); const path = step.path.map(p => getRealId(p)); await wsApi.send('AddElement', { Class_Id: classId, Field_Path: path, Element_Type: step.elementType || '', Value: step.value || '' }); this.record({ type: 'AddElement', classId, path, elementType: step.elementType || '', value: step.value || '' }); console.log('[replay] AddElement', path); break; }
                    case 'RemoveElement': { const classId = getRealId(step.classId); const path = step.path.map(p => getRealId(p)); const payload = { Class_Id: classId, Field_Path: path }; if (step.index !== undefined) payload.Index = step.index; await wsApi.send('RemoveElement', payload); this.record({ type: 'RemoveElement', classId, path, ...(step.index !== undefined ? { index: step.index } : {}) }); console.log('[replay] RemoveElement', path); break; }
                    case 'RemoveClass': { const realId = getRealId(step.classId); await wsApi.send('RemoveClass', { Class_Id: realId }); this.record({ type: 'RemoveClass', classId: realId }); console.log('[replay] RemoveClass', realId); break; }
                } if (onProgress) onProgress(Math.round(((i + 1) / optimizedSteps.length) * 100));
            } console.log('[replay] 完成 idMap:', idMap, 'pathMap:', pathMap); return { idMap, pathMap };
        }
    }
    const stepRecorder = new StepRecorder();

    const { createApp, ref, computed, onMounted, onUnmounted, inject, provide, watch } = Vue;

    const ClassTreeNode = { name: 'ClassTreeNode', template: '#class-tree-node-template', props: { node: Object, label: String }, setup(props) { const isOpen = ref(true); const isExpandable = computed(() => props.node.children && props.node.children.length > 0); return { isOpen, isExpandable }; } };

    function buildNodeFromData(key, data, path, fallbackType, pathMap) {
        const id = Date.now() + Math.random();
        if (data === null || data === undefined) return { id, key, path, fieldType: fallbackType || 'String', elementType: null, isArray: false, value: '', children: [], expanded: false, collapsed: false, subclassType: null, subclassId: null };
        if (typeof data === 'object' && !Array.isArray(data)) {
            if (data.type) {
                const subclassType = data.type; const subclassId = pathMap[path.join('.')] || null; const children = [];
                for (const [k, v] of Object.entries(data)) { if (k === 'type') continue; children.push(buildNodeFromData(k, v, [...path, k], 'String', pathMap)); }
                return { id, key, path, fieldType: fallbackType || 'Object', elementType: null, isArray: false, value: '', children, expanded: true, collapsed: false, subclassType, subclassId };
            } else {
                const children = []; for (const [k, v] of Object.entries(data)) children.push(buildNodeFromData(k, v, [...path, k], 'String', pathMap)); return { id, key, path, fieldType: fallbackType || 'Object', elementType: null, isArray: false, value: '', children, expanded: true, collapsed: false, subclassType: null, subclassId: null };
            }
        }
        if (Array.isArray(data)) { const children = data.map((item, idx) => buildNodeFromData(`#${idx}`, item, [...path, `#${idx}`], 'String', pathMap)); return { id, key, path, fieldType: fallbackType || 'Array', elementType: 'String', isArray: true, value: '', children, expanded: true, collapsed: false, subclassType: null, subclassId: null }; }
        return { id, key, path, fieldType: fallbackType || 'String', elementType: null, isArray: false, value: String(data), children: [], expanded: false, collapsed: false, subclassType: null, subclassId: null };
    }

    const EditorNode = {
        name: 'EditorNode', template: '#editor-node-template', props: { node: Object, classId: Number }, emits: ['remove'],
        setup(props, { emit }) {
            const showToast = inject('showToast'); const selectedClass = inject('selectedClass'); const allFields = inject('allFields');
            const saving = ref(false); const instanceOptions = ref([]); const allTypes = ref([]); const refMode = ref('instance'); const selectedType = ref('');
            const expanding = ref(false); const removing = ref(false); const creatingType = ref(false); const displayMode = ref('loading');
            const fieldSelectorVisible = ref(false); const fieldSearchQuery = ref(''); const allObjectFields = ref([]);
            const typeSelectorVisible = ref(false); const typeSearchQuery = ref(''); const instanceSearchQuery = ref('');

            if (props.node.collapsed === undefined) props.node.collapsed = false;
            const canCollapse = computed(() => props.node.isArray || displayMode.value === 'object' || displayMode.value === 'subclass-editing' || (displayMode.value === 'array' && props.node.children.length > 0));
            const isBooleanField = computed(() => { const t = (props.node.fieldType || '').toLowerCase(); return t === 'boolean' || t === 'java.lang.boolean'; });
            const collapseSummary = computed(() => { const count = props.node.children.length; return count > 0 ? `// ${count} items` : `// empty`; });

            const uncreatedFields = computed(() => { const createdKeys = props.node.children.map(c => c.key); return allObjectFields.value.filter(f => !createdKeys.includes(f.name)); });
            const filteredUncreatedFields = computed(() => { const list = uncreatedFields.value; if (!fieldSearchQuery.value) return list; const q = fieldSearchQuery.value.toLowerCase(); return list.filter(f => f.name.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q) || f.type.toLowerCase().includes(q) || f.doc.toLowerCase().includes(q)); });
            const filteredTypes = computed(() => { if (!typeSearchQuery.value) return allTypes.value; const q = typeSearchQuery.value.toLowerCase(); return allTypes.value.filter(t => t.name.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q) || t.doc.toLowerCase().includes(q)); });
            const filteredInstances = computed(() => { if (!instanceSearchQuery.value) return instanceOptions.value; const q = instanceSearchQuery.value.toLowerCase(); return instanceOptions.value.filter(i => i.name.toLowerCase().includes(q) || i.displayName.toLowerCase().includes(q)); });

            const loadAllObjectFields = async (typeName) => {
                if (!typeName) return;
                try {
                    const res = await wsApi.send('AllField', { Class_Name: typeName });
                    if (res.Field_List) {
                        const fieldsPromises = res.Field_List.map(async f => {
                            const fieldName = typeof f === 'string' ? f : (f.str || String(f)); const fieldType = typeof f === 'string' ? 'String' : (f.json || 'String');
                            const docStr = await DataProvider.getFieldDoc(typeName, fieldName); const displayName = await DataProvider.getDisplayName('Field', typeName, fieldName); const weight = await weightMgr.getFieldWeight(typeName, fieldName);
                            return { name: fieldName, displayName: displayName, type: fieldType, doc: docStr === "" ? "暂无描述" : docStr, weight };
                        });
                        allObjectFields.value = (await Promise.all(fieldsPromises)).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
                    }
                } catch (e) { console.error('加载对象字段失败:', e); }
            };

            onMounted(async () => {
                if (props.node.isArray) { displayMode.value = 'array'; return; }
                if (isBasicType(props.node.fieldType)) { displayMode.value = 'leaf-text'; return; }
                if (props.node.subclassId !== null && props.node.subclassId !== undefined) { displayMode.value = 'subclass-editing'; if (props.node.children.length > 0) props.node.expanded = true; await loadAllObjectFields(props.node.subclassType); return; }
                if (props.node.children.length > 0) { displayMode.value = props.node.subclassType ? 'subclass-editing' : 'object'; props.node.expanded = true; await loadAllObjectFields(props.node.subclassType || props.node.fieldType); return; }
                const [instances, types] = await Promise.all([ fetchClassInstances(props.node.fieldType), fetchAllTypes(props.node.fieldType) ]);
                instanceOptions.value = instances;
                const typeObjs = await Promise.all(types.map(async t => { const docStr = await DataProvider.getClassDoc(t); const dName = await DataProvider.getDisplayName('Class', null, t); return { name: t, displayName: dName, doc: docStr === "" ? "暂无描述" : docStr }; }));
                allTypes.value = typeObjs;
                if (instances.length > 0 || typeObjs.length > 0) { displayMode.value = 'type-select'; refMode.value = instances.length > 0 ? 'instance' : 'newclass'; } else { displayMode.value = 'object'; await loadAllObjectFields(props.node.fieldType); }
            });

            const toggleCollapse = () => { if (canCollapse.value) props.node.collapsed = !props.node.collapsed; };
            const saveValue = async () => { saving.value = true; try { await wsApi.send('SetFieldValue', { Class_Id: props.classId, Field_Path: props.node.path, Value: String(props.node.value) }); stepRecorder.record({ type: 'SetFieldValue', classId: props.classId, path: props.node.path, value: String(props.node.value) }); } catch (e) { showToast('保存失败: ' + (e.message || e), 'error'); } finally { saving.value = false; } };
            const toggleBoolean = async () => { props.node.value = props.node.value === 'true' ? 'false' : 'true'; await saveValue(); };
            const createTypeInstance = async () => {
                if (!selectedType.value) return; creatingType.value = true;
                try {
                    const res = await wsApi.send('NewClass', { Class_Name: selectedType.value }); let subId = res.Class_Id; if (typeof subId === 'object' && subId !== null) subId = Object.values(subId)[0];
                    await wsApi.send('SetFieldValue', { Class_Id: props.classId, Field_Path: props.node.path, Value_Class_Id: subId });
                    stepRecorder.record({ type: 'NewClass', className: selectedType.value, classId: subId }); stepRecorder.record({ type: 'SetFieldValue', classId: props.classId, path: props.node.path, valueClassId: subId });
                    props.node.subclassType = selectedType.value; props.node.subclassId = subId; props.node.value = ''; displayMode.value = 'subclass-editing'; props.node.expanded = true; await loadAllObjectFields(selectedType.value);
                } catch (e) { showToast('创建实例失败: ' + (e.message || e), 'error'); } finally { creatingType.value = false; }
            };

            const selectTypeAndCreate = async (typeName) => { selectedType.value = typeName; typeSelectorVisible.value = false; await createTypeInstance(); };
            const selectInstanceAndSave = async (inst) => { props.node.value = inst.name; typeSelectorVisible.value = false; await saveValue(); };
            const bypassTypeSelect = async () => { displayMode.value = 'object'; props.node.expanded = true; await loadAllObjectFields(props.node.fieldType); };
            const expandObject = async () => { if (expanding.value) return; expanding.value = true; try { await loadAllObjectFields(props.node.subclassType || props.node.fieldType); props.node.expanded = true; } catch (e) { showToast('展开对象失败: ' + (e.message || e), 'error'); } finally { expanding.value = false; } };

            const resetObjectType = async () => {
                if (confirm('重新选择类型将清空该属性下的所有配置，确定吗？')) {
                    if (props.node.subclassId !== null && props.node.subclassId !== undefined) { try { await wsApi.send('RemoveClass', { Class_Id: props.node.subclassId }); } catch(e) {} }
                    try { await wsApi.send('RemoveElement', { Class_Id: props.classId, Field_Path: props.node.path }); } catch(e) {}
                    props.node.subclassType = null; props.node.subclassId = null; props.node.children = []; props.node.value = ''; props.node.expanded = false;
                    const [instances, types] = await Promise.all([ fetchClassInstances(props.node.fieldType), fetchAllTypes(props.node.fieldType) ]); instanceOptions.value = instances;
                    const typeObjs = await Promise.all(types.map(async t => { const docStr = await DataProvider.getClassDoc(t); const dName = await DataProvider.getDisplayName('Class', null, t); return { name: t, displayName: dName, doc: docStr === "" ? "暂无描述" : docStr }; })); allTypes.value = typeObjs;
                    if (instances.length > 0 || typeObjs.length > 0) { displayMode.value = 'type-select'; refMode.value = instances.length > 0 ? 'instance' : 'newclass'; } else { displayMode.value = 'object'; }
                }
            };

            const addArrayElement = async () => {
                try {
                    const res = await wsApi.send('AddElement', { Class_Id: props.classId, Field_Path: props.node.path, Element_Type: props.node.elementType || '', Value: '' });
                    let idx = res.Index;
                    if (typeof idx === 'object' || idx == null) { const vals = Object.values(idx || {}); idx = vals.length > 0 ? vals[0] : props.node.children.length; }
                    if (idx === -1) idx = props.node.children.length;
                    stepRecorder.record({ type: 'AddElement', classId: props.classId, path: props.node.path, elementType: props.node.elementType || '', value: '' });
                    props.node.children.push({ id: Date.now() + Math.random(), key: `${idx}`, path: [...props.node.path, `#${idx}`], fieldType: props.node.elementType || 'String', elementType: null, isArray: false, value: '', children: [], expanded: false, collapsed: false });
                    props.node.collapsed = false;
                } catch (e) { showToast('添加数组元素失败: ' + (e.message || e), 'error'); }
            };

            const selectAndCreateField = (field) => { const tInfo = parseTypeInfo(field.type); props.node.children.push({ id: Date.now() + Math.random(), key: field.name, path: [...props.node.path, field.name], fieldType: tInfo.baseType, elementType: tInfo.elementType, isArray: tInfo.isArray, value: '', children: [], expanded: false, collapsed: false, subclassType: null, subclassId: null }); fieldSelectorVisible.value = false; fieldSearchQuery.value = ''; };
            const removeChild = async (index) => {
                const child = props.node.children[index]; const path = child.path; const lastSegment = path[path.length - 1]; removing.value = true;
                try {
                    if (lastSegment.startsWith('#')) { const arrayPath = path.slice(0, -1); const idx = parseInt(lastSegment.slice(1)); await wsApi.send('RemoveElement', { Class_Id: props.classId, Field_Path: arrayPath, Index: idx }); stepRecorder.record({ type: 'RemoveElement', classId: props.classId, path: arrayPath, index: idx }); }
                    else { await wsApi.send('RemoveElement', { Class_Id: props.classId, Field_Path: path }); stepRecorder.record({ type: 'RemoveElement', classId: props.classId, path: path }); }
                    props.node.children.splice(index, 1);
                } catch (e) { showToast('删除失败: ' + (e.message || e), 'error'); } finally { removing.value = false; }
            };

            const handleRemove = () => { emit('remove'); };

            const contextMenuVisible = ref(false); const contextMenuX = ref(0); const contextMenuY = ref(0); let longPressTimer = null; let touchStartPos = null;
            const showContextMenu = (e) => { e.preventDefault(); contextMenuX.value = e.clientX; contextMenuY.value = e.clientY; contextMenuVisible.value = true; };
            const hideContextMenu = () => { contextMenuVisible.value = false; };
            const onTouchStart = (e) => { touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; longPressTimer = setTimeout(() => { contextMenuX.value = touchStartPos.x; contextMenuY.value = touchStartPos.y; contextMenuVisible.value = true; }, 500); };
            const onTouchEnd = () => { clearTimeout(longPressTimer); longPressTimer = null; };
            const onTouchMove = (e) => { if (!touchStartPos) return; const dx = Math.abs(e.touches[0].clientX - touchStartPos.x); const dy = Math.abs(e.touches[0].clientY - touchStartPos.y); if (dx > 10 || dy > 10) { clearTimeout(longPressTimer); longPressTimer = null; } };
            const onTouchCancel = () => { clearTimeout(longPressTimer); longPressTimer = null; };

            const langEditorVisible = ref(false); const langEditName = ref(''); const langEditDoc = ref('');
            const editLangPack = async () => { hideContextMenu(); const className = selectedClass.value; const fieldName = props.node.key; langEditName.value = (await DataProvider.getDisplayName('Field', className, fieldName)) || fieldName; langEditDoc.value = (await DataProvider.getFieldDoc(className, fieldName)) || ''; langEditorVisible.value = true; };
            const saveLangPack = async () => {
                const className = selectedClass.value; const fieldName = props.node.key;
                await i18n.set(`Field.${className}.${fieldName}.name`, langEditName.value); await i18n.set(`Field.${className}.${fieldName}.doc`, langEditDoc.value);
                langEditorVisible.value = false;
                if (allFields && allFields.value) { const field = allFields.value.find(f => f.name === fieldName); if (field) { field.displayName = langEditName.value; field.doc = langEditDoc.value || '暂无描述'; } }
                showToast('语言包已更新', 'success');
            };
            const copyFieldName = () => { hideContextMenu(); navigator.clipboard.writeText(props.node.key); showToast('已复制字段名', 'success'); };

            onMounted(() => { document.addEventListener('click', hideContextMenu); }); onUnmounted(() => { document.removeEventListener('click', hideContextMenu); });

            return {
                saving, instanceOptions, allTypes, refMode, selectedType, expanding, removing, creatingType, displayMode, canCollapse, collapseSummary, isBooleanField,
                toggleCollapse, saveValue, toggleBoolean, createTypeInstance, expandObject, addArrayElement, removeChild, handleRemove, uncreatedFields, resetObjectType, bypassTypeSelect,
                fieldSelectorVisible, fieldSearchQuery, filteredUncreatedFields, selectAndCreateField, typeSelectorVisible, typeSearchQuery, instanceSearchQuery, filteredTypes, filteredInstances, selectTypeAndCreate, selectInstanceAndSave,
                contextMenuVisible, contextMenuX, contextMenuY, showContextMenu, hideContextMenu, onTouchStart, onTouchEnd, onTouchMove, onTouchCancel,
                langEditorVisible, langEditName, langEditDoc, editLangPack, saveLangPack, copyFieldName
            };
        }
    };

    // ==========================================
    // 主应用 Application
    // ==========================================
    const app = createApp({
        setup() {
            const wsUrl = ref('ws://localhost:8317');
            const dataDir = ref('.mindustrymit-data');
            const connected = ref(false); const isConnecting = ref(false); const connectProgress = ref({ text: '', percent: 0 });
            const isLoadingClasses = ref(false); const isLoadingFields = ref(false);
            const classList = ref([]); const selectedClass = ref('Block'); const classId = ref(null);
            const allFields = ref([]); const searchQuery = ref(''); const rootNodes = ref([]);

            const controlCenterOpen = ref(false);
            const workspaceMode = ref('instance');

            // Schema 控制台
            const schemaConsoleOpen = ref(false);
            const schemaConsoleTab = ref('classes');
            const customClasses = ref([]);
            const customClassesData = ref({});
            const customFields = ref([]);

            const typeSelectorOpen = ref(false); const typeSelectorQuery = ref(''); const typeSelectorItems = ref([]); let typeSelectResolve = null;
            const schemaDraft = ref({ className: 'MyCustomBlock', parentType: 'Block', fields: [] });

            const schemaMetaEditorOpen = ref(false); const schemaMetaKey = ref(''); const schemaMetaValue = ref('');
            const schemaFieldEditorOpen = ref(false); const editingSchemaFieldIndex = ref(-1);
            const schemaFieldForm = ref({ name: '', type: 'String', isArray: false, defaultValue: '', notes: '' });

            const extendClassModalOpen = ref(false); const isSavingField = ref(false);
            const extendFieldForm = ref({ targetClass: 'Block', fieldName: '', type: 'String', isArray: false, defaultValue: '', notes: '', applyToSubclasses: true });

            const classSelectorVisible = ref(false); const classSearchQuery = ref('');
            const importDialogVisible = ref(false); const exportDialogVisible = ref(false); const importing = ref(false); const importProgress = ref(0);
            const isGeneratingDict = ref(false); const dictProgress = ref(0); const dictCurrentTask = ref(''); const isImportingDict = ref(false); const importDictProgress = ref(0);
            const isGeneratingWeight = ref(false); const weightProgress = ref(0); const weightCurrentTask = ref(''); const isImportingWeight = ref(false); const importWeightProgress = ref(0);
            const isTrainingWeight = ref(false); const trainingProgress = ref(0); const trainingCurrentTask = ref('');

            // 本地项目
            const localProjects = ref([]);

            const leftDrawerOpen = ref(false); const previewOpen = ref(false); const isMobile = ref(isMobileDevice()); 
            const isDarkMode = ref(false);
            const toasts = ref([]); let instanceOpToken = 0;
            const showToast = (msg, type = 'info') => { const id = Date.now() + Math.random(); toasts.value.push({ id, msg, type }); setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 3000); };
            const cleanupOldClass = async (oldClassId, newClassId) => { if (oldClassId === null || oldClassId === undefined || oldClassId === newClassId) return; try { await wsApi.send('RemoveClass', { Class_Id: oldClassId }); } catch (e) { console.warn('清理旧实例失败:', e); } };
            provide('showToast', showToast); provide('selectedClass', selectedClass); provide('allFields', allFields);

            const closeTransientPanels = () => {
                leftDrawerOpen.value = false; previewOpen.value = false; controlCenterOpen.value = false; schemaConsoleOpen.value = false;
                typeSelectorOpen.value = false; schemaMetaEditorOpen.value = false; schemaFieldEditorOpen.value = false; extendClassModalOpen.value = false;
                importDialogVisible.value = false; exportDialogVisible.value = false;
            };

            // 互斥打开底部面板
            const togglePanel = (panelName) => {
                if (schemaConsoleOpen.value) schemaConsoleOpen.value = false;
                if (panelName === 'leftDrawer') {
                    leftDrawerOpen.value = !leftDrawerOpen.value;
                    if (leftDrawerOpen.value) { previewOpen.value = false; controlCenterOpen.value = false; }
                } else if (panelName === 'preview') {
                    previewOpen.value = !previewOpen.value;
                    if (previewOpen.value) { leftDrawerOpen.value = false; controlCenterOpen.value = false; }
                } else if (panelName === 'controlCenter') {
                    controlCenterOpen.value = !controlCenterOpen.value;
                    if (controlCenterOpen.value) { leftDrawerOpen.value = false; previewOpen.value = false; }
                }
            };

            // 主题管理
            const updateTheme = (dark) => {
                isDarkMode.value = dark;
                if (dark) document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
            };

            const initTheme = () => {
                const savedTheme = localStorage.getItem('theme');
                if (savedTheme) {
                    updateTheme(savedTheme === 'dark');
                } else {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    updateTheme(prefersDark);
                }
            };

            const toggleTheme = () => {
                const newTheme = !isDarkMode.value;
                updateTheme(newTheme);
                localStorage.setItem('theme', newTheme ? 'dark' : 'light');
            };

            const handleWsClose = () => {
                const wasConnected = connected.value;
                connected.value = false; isConnecting.value = false; isLoadingFields.value = false; importing.value = false;
                closeTransientPanels();
                if (wasConnected) showToast('连接已断开', 'error');
            };

            const loadBuiltinPack = async (fileName) => {
                const res = await fetch('/' + encodeURIComponent(fileName));
                if (!res.ok) throw new Error(`无法加载 ${fileName}`);
                return await res.text();
            };

            const restoreBuiltinDict = async (silent = false) => {
                isImportingDict.value = true; importDictProgress.value = 0;
                try {
                    const json = await loadBuiltinPack('MMIT中文语言包.json');
                    const ok = await i18n.importJSON(json, p => importDictProgress.value = p);
                    if (!ok) throw new Error('语言包格式无效');
                    if (connected.value) await refreshClassListDisplay();
                    if (!silent) showToast('已恢复内置语言包', 'success');
                } catch (e) {
                    if (!silent) showToast('恢复内置语言包失败: ' + (e.message || e), 'error');
                    throw e;
                } finally {
                    isImportingDict.value = false;
                }
            };

            const restoreBuiltinWeightPack = async (silent = false) => {
                isImportingWeight.value = true; importWeightProgress.value = 0;
                try {
                    const json = await loadBuiltinPack('MMIT权重包.json');
                    const ok = await weightMgr.importJSON(json, p => importWeightProgress.value = p);
                    if (!ok) throw new Error('权重包格式无效');
                    if (connected.value) await refreshClassListDisplay();
                    if (!silent) showToast('已恢复内置权重包', 'success');
                } catch (e) {
                    if (!silent) showToast('恢复内置权重包失败: ' + (e.message || e), 'error');
                    throw e;
                } finally {
                    isImportingWeight.value = false;
                }
            };

            const loadBuiltinDefaultsIfEmpty = async () => {
                try {
                    if (await i18n.isEmpty()) await restoreBuiltinDict(true);
                    if (await weightMgr.isEmpty()) await restoreBuiltinWeightPack(true);
                } catch (e) {
                    console.warn('加载内置默认包失败:', e);
                }
            };

            onMounted(() => {
                initTheme();
                // 监听系统主题变化
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                    if (!localStorage.getItem('theme')) { // 仅在用户未手动指定主题时跟随系统
                        updateTheme(e.matches);
                    }
                });

                window.addEventListener('ws-error', (e) => showToast(e.detail, 'error'));
                window.addEventListener('ws-close', handleWsClose);
                loadBuiltinDefaultsIfEmpty();
                loadLocalProjects();
            });

            onUnmounted(() => {
                window.removeEventListener('ws-close', handleWsClose);
            });

            const loadCustomSchemas = async () => {
                const classes = await schemaMgr.getClasses();
                customClassesData.value = classes;
                customClasses.value = Object.keys(classes);
                customFields.value = await schemaMgr.getFields();
            };

            // 本地项目管理
            const loadLocalProjects = async () => {
                const projects = [];
                await projectStore.iterate((value, key) => {
                    projects.push({ id: key, ...value });
                });
                localProjects.value = projects.sort((a, b) => b.time - a.time);
            };

            const saveProjectToDb = async () => {
                if (classId.value === null || classId.value === undefined) { showToast('尚未创建任何实例', 'error'); return; }
                try {
                    const res = await wsApi.send('ExportClass', { Class_Id: classId.value });
                    const content = res.Content;
                    const projectName = prompt('请输入本地项目名称:', `${selectedClass.value}_${new Date().toLocaleTimeString('zh-CN', {hour12:false})}`);
                    if (!projectName) return;

                    const projectData = {
                        name: projectName,
                        className: selectedClass.value,
                        time: Date.now(),
                        content: content
                    };
                    await projectStore.setItem(`proj_${Date.now()}`, projectData);
                    showToast('项目已成功保存到浏览器', 'success');
                    await loadLocalProjects();
                } catch (e) {
                    showToast('保存失败: ' + e.message, 'error');
                }
            };

            const loadProjectFromDb = async (project) => {
                if (!connected.value) { showToast('请先连接服务器', 'error'); return; }
                if (!confirm(`确定要加载本地项目 "${project.name}" 吗？当前未保存的更改将丢失。`)) return;

                const token = ++instanceOpToken; const oldClassId = classId.value; const projectClassName = project.className; let newClassId = null; let switched = false;
                importing.value = true;
                controlCenterOpen.value = false;
                try {
                    const res = await wsApi.send('ImportClass', { Content: project.content });
                    if (!res.Success) { showToast('加载失败: ' + res.Message, 'error'); return; }

                    newClassId = res.Class_Id;
                    const workspace = await loadWorkspaceData(newClassId, projectClassName);
                    if (token !== instanceOpToken) { await cleanupOldClass(newClassId, oldClassId); return; }
                    classId.value = newClassId;
                    selectedClass.value = projectClassName;
                    allFields.value = workspace.fields; rootNodes.value = workspace.nodes; searchQuery.value = ''; switched = true;
                    stepRecorder.clear();
                    stepRecorder.record({ type: 'NewClass', className: projectClassName, classId: newClassId });
                    await cleanupOldClass(oldClassId, newClassId);
                    showToast('项目加载成功！', 'success');
                } catch (e) {
                    if (!switched) await cleanupOldClass(newClassId, oldClassId);
                    showToast('加载失败: ' + (e.message || e), 'error');
                } finally {
                    if (token === instanceOpToken) importing.value = false;
                }
            };

            const deleteProjectFromDb = async (id) => {
                if (confirm('确定要删除该本地项目吗？此操作不可恢复。')) {
                    await projectStore.removeItem(id);
                    showToast('项目已删除', 'success');
                    await loadLocalProjects();
                }
            };

            const refreshClassListDisplay = async () => {
                const classObjs = await Promise.all(classList.value.map(async cls => {
                    const doc = await DataProvider.getClassDoc(cls.name);
                    const dName = await DataProvider.getDisplayName('Class', null, cls.name);
                    const weight = await weightMgr.getClassWeight(cls.name);
                    return { ...cls, displayName: dName, doc: doc === "" ? "暂无描述" : doc, weight };
                }));
                classObjs.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
                classList.value = classObjs;
            };

            const connectAndInit = async () => {
                isConnecting.value = true; connectProgress.value = { text: '正在连接 WebSocket...', percent: 5 };
                try {
                    let correctedUrl = wsUrl.value.trim(); if (correctedUrl.startsWith('ws//')) correctedUrl = 'ws://' + correctedUrl.slice(4); else if (correctedUrl.startsWith('wss//')) correctedUrl = 'wss://' + correctedUrl.slice(5); wsUrl.value = correctedUrl;
                    await wsApi.connect(correctedUrl); connectProgress.value = { text: '连接成功，正在初始化...', percent: 15 };
                    await wsApi.send('Init', { Data_Dir: dataDir.value });

                    connectProgress.value = { text: '正在同步自定义模型 (Schema)...', percent: 40 };
                    const syncRes = await schemaMgr.syncToBackend(wsApi); await loadCustomSchemas();
                    console.log(`[init] 同步了 ${syncRes.classCount} 个自定义 Class, ${syncRes.fieldCount} 个扩展 Field`);

                    connectProgress.value = { text: '正在构建类继承关系...', percent: 50 }; await buildParentClassMap();
                    connectProgress.value = { text: '正在加载类型列表...', percent: 70 };
                    const res = await wsApi.send('AllClass'); const rawClasses = res.Class_List ? res.Class_List.sort() : [];
                    connectProgress.value = { text: `正在翻译类型名称 (${rawClasses.length} 个)...`, percent: 85 };

                    const classObjs = await Promise.all(rawClasses.map(async cls => {
                        const doc = await DataProvider.getClassDoc(cls); const dName = await DataProvider.getDisplayName('Class', null, cls); const weight = await weightMgr.getClassWeight(cls);
                        return { name: cls, displayName: dName, doc: doc === "" ? "暂无描述" : doc, weight, _isBasic: false };
                    }));
                    classObjs.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)); classList.value = classObjs;
                    connectProgress.value = { text: '完成', percent: 100 }; connected.value = true;
                } catch (e) { showToast("连接或初始化失败: " + (e.message || e), 'error'); connected.value = false; connectProgress.value = { text: '失败: ' + (e.message || ''), percent: 0 }; } finally { isConnecting.value = false; }
            };

            // ==========================================
            // 全局通用类型选择器 (Type Selector)
            // ==========================================
            const openTypeSelector = (includeBasics = true) => {
                return new Promise(resolve => {
                    const basics = includeBasics ? ['String', 'int', 'float', 'boolean', 'double', 'long', 'short', 'byte'].map(n => ({ name: n, displayName: n, doc: '基础数据类型', _isBasic: true })) : [{ name: '', displayName: '-- 无 (留空) --', doc: '不继承任何父类', _isBasic: true }];
                    typeSelectorItems.value = [...basics, ...classList.value]; typeSelectorQuery.value = ''; typeSelectResolve = resolve; typeSelectorOpen.value = true;
                });
            };
            const closeTypeSelector = () => { if (typeSelectResolve) typeSelectResolve(null); typeSelectorOpen.value = false; };
            const handleTypeSelect = (name) => { if (typeSelectResolve) typeSelectResolve(name); typeSelectorOpen.value = false; };
            const filteredTypeSelectorItems = computed(() => {
                if (!typeSelectorQuery.value) return typeSelectorItems.value; const q = typeSelectorQuery.value.toLowerCase();
                return typeSelectorItems.value.filter(item => item.name.toLowerCase().includes(q) || item.displayName.toLowerCase().includes(q) || (item.doc && item.doc.toLowerCase().includes(q)));
            });

            // ==========================================
            // Schema Console & Builder 交互逻辑
            // ==========================================
            const openSchemaConsole = () => { loadCustomSchemas(); schemaConsoleOpen.value = true; controlCenterOpen.value = false; };
            const startSchemaBuilder = () => { workspaceMode.value = 'schema'; schemaConsoleOpen.value = false; controlCenterOpen.value = false; schemaDraft.value = { className: 'MyCustomBlock', parentType: 'Block', fields: [] }; };
            const editSchemaClass = (className) => {
                const def = customClassesData.value[className];
                if (def) { schemaDraft.value = JSON.parse(JSON.stringify({ className, parentType: def.parentType, fields: def.fields || [] })); workspaceMode.value = 'schema'; schemaConsoleOpen.value = false; }
            };

            const editSchemaMeta = (key) => { schemaMetaKey.value = key; schemaMetaValue.value = schemaDraft.value[key]; schemaMetaEditorOpen.value = true; };
            const saveSchemaMeta = () => { if (schemaMetaKey.value === 'className' && !schemaMetaValue.value.trim()) { showToast('类名不能为空', 'error'); return; } schemaDraft.value[schemaMetaKey.value] = schemaMetaValue.value.trim(); schemaMetaEditorOpen.value = false; };
            const addSchemaField = () => { schemaDraft.value.fields.push({ id: Date.now(), name: 'newField', type: 'String', defaultValue: '', notes: '' }); editSchemaField(schemaDraft.value.fields.length - 1); };

            const editSchemaField = (index) => {
                editingSchemaFieldIndex.value = index;
                const field = schemaDraft.value.fields[index];
                const isArr = field.type.endsWith('[]');
                const baseT = isArr ? field.type.slice(0, -2) : field.type;
                schemaFieldForm.value = { name: field.name, type: baseT, isArray: isArr, defaultValue: field.defaultValue, notes: field.notes };
                schemaFieldEditorOpen.value = true;
            };

            const saveSchemaField = () => {
                if (!schemaFieldForm.value.name.trim()) { showToast('字段名不能为空', 'error'); return; } if (!schemaFieldForm.value.type.trim()) { showToast('字段类型不能为空', 'error'); return; }
                let finalType = schemaFieldForm.value.type.trim();
                if (schemaFieldForm.value.isArray) finalType += '[]';
                schemaDraft.value.fields[editingSchemaFieldIndex.value] = { id: schemaDraft.value.fields[editingSchemaFieldIndex.value].id, name: schemaFieldForm.value.name.trim(), type: finalType, defaultValue: schemaFieldForm.value.defaultValue.trim(), notes: schemaFieldForm.value.notes.trim() };
                schemaFieldEditorOpen.value = false;
            };

            const saveAndRegisterSchema = async () => {
                const { className, parentType, fields } = schemaDraft.value; if (!className) { showToast('类名不能为空', 'error'); return; } const actualParent = parentType || 'Object';
                try {
                    await wsApi.send('DefineClass', { Class_Name: className, Parent_Type: actualParent, Fields: fields }); await schemaMgr.saveClass(className, { parentType: actualParent, fields });
                    if (!classList.value.find(c => c.name === className)) classList.value.push({ name: className, displayName: className, doc: '自定义类', weight: 999, _isBasic: false });
                    await loadCustomSchemas(); showToast(`自定义类 ${className} 注册成功！`, 'success'); workspaceMode.value = 'instance'; selectedClass.value = className; await createInstance();
                } catch (e) { showToast('注册失败: ' + (e.message || e), 'error'); }
            };

            const deleteCustomClass = async (className) => {
                if(confirm(`确定删除自定义类 ${className} 吗？`)) { await schemaMgr.removeClass(className); try { await wsApi.send('RemoveCustomClass', { Class_Name: className }); } catch(e){} classList.value = classList.value.filter(c => c.name !== className); await loadCustomSchemas(); showToast('已删除', 'success'); }
            };

            // ==========================================
            // 扩展现有类 (AddField) 交互逻辑
            // ==========================================
            const openExtendClassModal = () => { extendFieldForm.value = { targetClass: selectedClass.value || 'Block', fieldName: '', type: 'String', isArray: false, defaultValue: '', notes: '', applyToSubclasses: true }; extendClassModalOpen.value = true; schemaConsoleOpen.value = false; controlCenterOpen.value = false; };
            const saveAndApplyCustomField = async () => {
                const f = extendFieldForm.value; if (!f.targetClass.trim() || !f.fieldName.trim() || !f.type.trim()) { showToast('类名、字段名和类型不能为空', 'error'); return; }
                let finalType = f.type.trim(); if (f.isArray) finalType += '[]';
                isSavingField.value = true;
                try {
                    await wsApi.send('AddField', { Class_Name: f.targetClass.trim(), Field_Name: f.fieldName.trim(), Field_Type: finalType, Default_Value: f.defaultValue.trim(), Notes: f.notes.trim(), Apply_To_Subclasses: f.applyToSubclasses });
                    const fieldId = `ext_${Date.now()}`;
                    await schemaMgr.saveField({ id: fieldId, targetClass: f.targetClass.trim(), fieldName: f.fieldName.trim(), fieldType: finalType, defaultValue: f.defaultValue.trim(), notes: f.notes.trim(), applyToSubclasses: f.applyToSubclasses });
                    const nameKey = `Field.${f.targetClass.trim()}.${f.fieldName.trim()}.name`; if (!(await i18n.get(nameKey))) { await i18n.set(nameKey, f.fieldName.trim().replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()); }
                    await loadCustomSchemas(); extendClassModalOpen.value = false; showToast(`已成功为 ${f.targetClass} 添加字段 ${f.fieldName}`, 'success');
                    if (workspaceMode.value === 'instance' && classId.value !== null) { await createInstance(); }
                } catch (e) { showToast('扩展字段失败: ' + (e.message || e), 'error'); } finally { isSavingField.value = false; }
            };

            const deleteCustomField = async (id) => { if(confirm(`确定删除该扩展字段吗？(删除后需重启后端生效)`)) { await schemaMgr.removeField(id); await loadCustomSchemas(); showToast('已从本地配置中移除', 'success'); } };

            const exportSchema = async () => { const jsonStr = await schemaMgr.exportJSON(); const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mindustry-schemas.json'; a.click(); URL.revokeObjectURL(url); showToast('Schema 导出成功', 'success'); };

            const importSchema = async (event) => {
                const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const success = await schemaMgr.importJSON(e.target.result);
                        if (success) {
                            showToast('Schema 导入成功，正在同步到引擎...', 'success');
                            const syncRes = await schemaMgr.syncToBackend(wsApi); await loadCustomSchemas();
                            showToast(`同步完成：${syncRes.classCount} 个类，${syncRes.fieldCount} 个字段`, 'success');
                            if (workspaceMode.value === 'instance' && classId.value !== null) await createInstance();
                        } else showToast('Schema 格式错误', 'error');
                    } catch (err) { showToast('导入失败: ' + (err.message || err), 'error'); }
                }; reader.readAsText(file); event.target.value = '';
            };

            // ==========================================
            // 原有实例编辑逻辑
            // ==========================================
            const createInstance = async () => {
                const token = ++instanceOpToken; const oldClassId = classId.value; const className = selectedClass.value; let cid = null; let switched = false;
                isLoadingFields.value = true;
                try {
                    const res = await wsApi.send('NewClass', { Class_Name: className }); cid = res.Class_Id; if (typeof cid === 'object' && cid !== null) cid = Object.values(cid)[0];
                    const fRes = await wsApi.send('AllField', { Class_Name: className }); let nextFields = [];
                    if (fRes.Field_List) {
                        const fieldsPromises = fRes.Field_List.map(async f => {
                            const fieldName = typeof f === 'string' ? f : (f.str || String(f)); const fieldType = typeof f === 'string' ? 'String' : (f.json || 'String');
                            const docStr = await DataProvider.getFieldDoc(className, fieldName); const displayName = await DataProvider.getDisplayName('Field', className, fieldName); const weight = await weightMgr.getFieldWeight(className, fieldName);
                            return { name: fieldName, displayName: displayName, type: fieldType, doc: docStr === "" ? "暂无描述" : docStr, weight };
                        });
                        nextFields = (await Promise.all(fieldsPromises)).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
                    }
                    if (token !== instanceOpToken) { await cleanupOldClass(cid, oldClassId); return; }
                    classId.value = cid; selectedClass.value = className; allFields.value = nextFields; switched = true;
                    stepRecorder.clear(); stepRecorder.record({ type: 'NewClass', className, classId: cid });
                    rootNodes.value = []; searchQuery.value = ''; await cleanupOldClass(oldClassId, cid); showToast(`已创建 ${className} 实例`, 'success');
                } catch (e) { if (!switched) await cleanupOldClass(cid, oldClassId); showToast('创建实例失败: ' + (e.message || e), 'error'); } finally { if (token === instanceOpToken) isLoadingFields.value = false; }
            };

            const selectAndCreateClass = (clsName) => { selectedClass.value = clsName; classSelectorVisible.value = false; classSearchQuery.value = ''; createInstance(); };
            const addFieldToRoot = (field) => { if (rootNodes.value.find(n => n.key === field.name)) { showToast('该字段已存在', 'error'); return; } const tInfo = parseTypeInfo(field.type); rootNodes.value.push({ id: Date.now() + Math.random(), key: field.name, path: [field.name], fieldType: tInfo.baseType, elementType: tInfo.elementType, isArray: tInfo.isArray, value: '', children: [], expanded: false, collapsed: false, subclassType: null, subclassId: null }); };
            const removeRootNode = async (index) => {
                const node = rootNodes.value[index];
                try { if (node.subclassId !== null && node.subclassId !== undefined) { await wsApi.send('RemoveClass', { Class_Id: node.subclassId }); stepRecorder.record({ type: 'RemoveClass', classId: node.subclassId }); } await wsApi.send('RemoveElement', { Class_Id: classId.value, Field_Path: node.path }); stepRecorder.record({ type: 'RemoveElement', classId: classId.value, path: node.path }); rootNodes.value.splice(index, 1); } catch (e) { showToast('删除失败: ' + (e.message || e), 'error'); }
            };

            // ==========================================
            // 导入导出、语言包、权重包逻辑
            // ==========================================
            const showImportDialog = () => { importDialogVisible.value = true; importProgress.value = 0; };
            const showExportDialog = () => { exportDialogVisible.value = true; };
            const exportProject = () => { const json = stepRecorder.exportJson(); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `mindustry-project-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url); exportDialogVisible.value = false; showToast('项目导出成功', 'success'); };
            const exportJsonFile = async () => {
                if (classId.value === null || classId.value === undefined) { showToast('尚未创建任何实例', 'error'); return; }
                try {
                    const res = await wsApi.send('ExportClass', { Class_Id: classId.value }); let finalContent = res.Content; try { finalContent = JSON.stringify(JSON.parse(finalContent), null, 2); } catch(e) {}
                    const blob = new Blob([finalContent], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${selectedClass.value.toLowerCase()}.json`; a.click(); URL.revokeObjectURL(url); exportDialogVisible.value = false; showToast('JSON 导出成功', 'success');
                } catch (e) { showToast('导出 JSON 失败: ' + e.message, 'error'); }
            };
            const loadWorkspaceData = async (cid, cName) => {
                const fRes = await wsApi.send('AllField', { Class_Name: cName }); let nextFields = [];
                if (fRes.Field_List) {
                    const fieldsPromises = fRes.Field_List.map(async f => { const fieldName = typeof f === 'string' ? f : (f.str || String(f)); const fieldType = typeof f === 'string' ? 'String' : (f.json || 'String'); const docStr = await DataProvider.getFieldDoc(cName, fieldName); const displayName = await DataProvider.getDisplayName('Field', cName, fieldName); const weight = await weightMgr.getFieldWeight(cName, fieldName); return { name: fieldName, displayName, type: fieldType, doc: docStr === "" ? "暂无描述" : docStr, weight }; });
                    nextFields = (await Promise.all(fieldsPromises)).sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
                }
                const exportRes = await wsApi.send('ExportClass', { Class_Id: cid });
                const data = JSON.parse(exportRes.Content); const nextRootNodes = [];
                for (const [key, value] of Object.entries(data)) { if (key === 'type') continue; const field = nextFields.find(f => f.name === key); const fieldType = field ? field.type : 'String'; const tInfo = parseTypeInfo(fieldType); const node = buildNodeFromData(key, value, [key], tInfo.baseType, {}); node.fieldType = tInfo.baseType; const isShorthandArray = Array.isArray(value) && value.length > 0 && value.every(v => typeof v === 'string'); node.elementType = isShorthandArray ? 'String' : tInfo.elementType; node.isArray = tInfo.isArray; nextRootNodes.push(node); }
                return { fields: nextFields, nodes: nextRootNodes };
            };

            const loadWorkspace = async (cid, cName) => {
                isLoadingFields.value = true; searchQuery.value = '';
                try { const workspace = await loadWorkspaceData(cid, cName); allFields.value = workspace.fields; rootNodes.value = workspace.nodes; }
                finally { isLoadingFields.value = false; }
            };

            const importClass = async (event) => {
                const file = event.target.files[0]; if (!file) return;
                const token = ++instanceOpToken; const oldClassId = classId.value; let newClassId = null; let switched = false;
                importing.value = true; importProgress.value = 10;
                try {
                    const content = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = e => resolve(e.target.result); r.onerror = reject; r.readAsText(file); });
                    const parsed = JSON.parse(content); const className = parsed.type; if (!className) { showToast('JSON 中缺少 type 字段', 'error'); return; }
                    importProgress.value = 30;
                    const res = await wsApi.send('ImportClass', { Content: content });
                    if (!res.Success) { showToast('导入失败: ' + res.Message, 'error'); return; }
                    newClassId = res.Class_Id; importProgress.value = 60;
                    const workspace = await loadWorkspaceData(newClassId, className);
                    if (token !== instanceOpToken) { await cleanupOldClass(newClassId, oldClassId); return; }
                    classId.value = newClassId; selectedClass.value = className; allFields.value = workspace.fields; rootNodes.value = workspace.nodes; searchQuery.value = ''; switched = true;
                    stepRecorder.clear(); stepRecorder.record({ type: 'NewClass', className, classId: newClassId });
                    await cleanupOldClass(oldClassId, newClassId);
                    importProgress.value = 100;
                    importDialogVisible.value = false; showToast('导入成功！', 'success');
                } catch (e) { if (!switched) await cleanupOldClass(newClassId, oldClassId); showToast('导入失败: ' + (e.message || e), 'error'); } finally { if (token === instanceOpToken) importing.value = false; event.target.value = ''; }
            };

            const generateFullDict = async () => {
                if (!connected.value) { showToast('请先连接服务器', 'error'); return; } if (isGeneratingDict.value) return; isGeneratingDict.value = true; dictProgress.value = 0; dictCurrentTask.value = '正在拉取 Class 列表...';
                try {
                    const res = await wsApi.send('AllClass'); const classes = res.Class_List ? res.Class_List : []; const total = classes.length;
                    for (let i = 0; i < total; i++) {
                        const clsName = classes[i]; dictCurrentTask.value = `[${i+1}/${total}] 正在抓取 ${clsName}...`;
                        const classDocKey = `Class.${clsName}.doc`; if (!(await i18n.get(classDocKey))) { const doc = await DataProvider.getClassDoc(clsName); if (doc) await i18n.set(classDocKey, doc); }
                        const classNameKey = `Class.${clsName}.name`; if (!(await i18n.get(classNameKey))) await i18n.set(classNameKey, clsName);
                        try {
                            const fRes = await wsApi.send('AllField', { Class_Name: clsName });
                            if (fRes && fRes.Field_List) { for (const f of fRes.Field_List) { const fName = typeof f === 'string' ? f : (f.str || String(f)); const fieldNameKey = `Field.${clsName}.${fName}.name`; if (!(await i18n.get(fieldNameKey))) await i18n.set(fieldNameKey, fName.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()); const fieldDocKey = `Field.${clsName}.${fName}.doc`; if (!(await i18n.get(fieldDocKey))) { const doc = await DataProvider.getFieldDoc(clsName, fName); if (doc) await i18n.set(fieldDocKey, doc); } } }
                        } catch (e) {}
                        try { const iRes = await wsApi.send('ClassInstance', { Class_Name: clsName }); if (iRes && iRes.Object_List) { for (const inst of iRes.Object_List) { const instName = typeof inst === 'string' ? inst : (inst.str || String(inst)); const instNameKey = `Instance.${clsName}.${instName}.name`; if (!(await i18n.get(instNameKey))) await i18n.set(instNameKey, instName); } } } catch (e) {}
                        dictProgress.value = Math.round(((i + 1) / total) * 100);
                    } showToast('语言包已完整生成！现在可以导出了', 'success');
                } catch (e) { showToast('生成终止: ' + e.message, 'error'); } finally { isGeneratingDict.value = false; }
            };

            const exportDict = async () => { const jsonStr = await i18n.exportJSON(); const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `mindustry-lang-dict.json`; a.click(); URL.revokeObjectURL(url); showToast('语言包导出成功', 'success'); };
            const importDict = async (event) => { const file = event.target.files[0]; if (!file) return; if (isImportingDict.value) return; const reader = new FileReader(); reader.onload = async (e) => { isImportingDict.value = true; importDictProgress.value = 0; try { const success = await i18n.importJSON(e.target.result, (p) => { importDictProgress.value = p; }); if (success) { if (connected.value) await refreshClassListDisplay(); showToast('语言包导入成功', 'success'); } else showToast('语言包格式错误', 'error'); } catch (err) { showToast('导入失败: ' + (err.message || err), 'error'); } finally { isImportingDict.value = false; } }; reader.readAsText(file); event.target.value = ''; };
            const resetDict = async () => { if (confirm('【危险操作】确定要清空本地所有语言包缓存吗？')) { await i18nStore.clear(); showToast('语言包已重置', 'success'); setTimeout(() => location.reload(), 1500); } };

            const generateFullWeightPack = async () => {
                if (!connected.value) { showToast('请先连接服务器', 'error'); return; } if (isGeneratingWeight.value) return; isGeneratingWeight.value = true; weightProgress.value = 0; weightCurrentTask.value = '正在拉取 Class 列表...';
                try {
                    const res = await wsApi.send('AllClass'); const classes = res.Class_List ? res.Class_List : []; const total = classes.length;
                    for (let i = 0; i < total; i++) {
                        const clsName = classes[i]; weightCurrentTask.value = `[${i+1}/${total}] 正在处理 ${clsName}...`;
                        const classWeightKey = `Class.${clsName}.weight`; if (await weightMgr.get(classWeightKey) == null) await weightMgr.set(classWeightKey, 0);
                        try { const fRes = await wsApi.send('AllField', { Class_Name: clsName }); if (fRes && fRes.Field_List) { for (const f of fRes.Field_List) { const fName = typeof f === 'string' ? f : (f.str || String(f)); const fieldWeightKey = `Field.${clsName}.${fName}.weight`; if (await weightMgr.get(fieldWeightKey) == null) await weightMgr.set(fieldWeightKey, 0); } } } catch (e) {}
                        weightProgress.value = Math.round(((i + 1) / total) * 100);
                    } showToast('权重包已生成！', 'success');
                } catch (e) { showToast('生成终止: ' + e.message, 'error'); } finally { isGeneratingWeight.value = false; }
            };

            const exportWeightPack = async () => { const jsonStr = await weightMgr.exportJSON(); const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'MMIT权重包.json'; a.click(); URL.revokeObjectURL(url); showToast('权重包导出成功', 'success'); };
            const importWeightPack = async (event) => { const file = event.target.files[0]; if (!file) return; if (isImportingWeight.value) return; const reader = new FileReader(); reader.onload = async (e) => { isImportingWeight.value = true; importWeightProgress.value = 0; try { const success = await weightMgr.importJSON(e.target.result, (p) => { importWeightProgress.value = p; }); if (success) { if (connected.value) await refreshClassListDisplay(); showToast('权重包导入成功', 'success'); } else showToast('权重包格式错误', 'error'); } catch (err) { showToast('导入失败: ' + (err.message || err), 'error'); } finally { isImportingWeight.value = false; } }; reader.readAsText(file); event.target.value = ''; };
            const resetWeightPack = async () => { if (confirm('确定要清空本地所有权重包缓存吗？')) { await weightStore.clear(); showToast('权重包已重置', 'success'); } };

            const trainWeightFromMod = async (event) => {
                const file = event.target.files[0]; if (!file) return; if (isTrainingWeight.value) return; isTrainingWeight.value = true; trainingProgress.value = 0; trainingCurrentTask.value = '正在解析模组文件...';
                try {
                    const zip = await JSZip.loadAsync(file); const allPaths = Object.keys(zip.files).filter(p => (p.startsWith('SFcontent/') || p.startsWith('content/')) && p.endsWith('.json') && !zip.files[p].dir);
                    if (allPaths.length === 0) { showToast('未找到 JSON 文件', 'error'); return; }
                    const classCounts = {}; const fieldCounts = {};
                    for (let i = 0; i < allPaths.length; i++) {
                        const path = allPaths[i]; trainingProgress.value = Math.round(((i + 1) / allPaths.length) * 80); trainingCurrentTask.value = `[${i+1}/${allPaths.length}] ${path.split('/').pop()}`;
                        try { const content = await zip.files[path].async('string'); const json = JSON.parse(content); const type = json.type || 'Block'; classCounts[type] = (classCounts[type] || 0) + 1; for (const key of Object.keys(json)) { if (key === 'type') continue; fieldCounts[`${type}.${key}`] = (fieldCounts[`${type}.${key}`] || 0) + 1; } } catch (e) {}
                    }
                    let classWritten = 0; for (const [type, count] of Object.entries(classCounts)) { const key = `Class.${type}.weight`; const existing = (await weightMgr.get(key)) || 0; await weightMgr.set(key, existing + count); classWritten++; }
                    let fieldWritten = 0; for (const [k, count] of Object.entries(fieldCounts)) { const dotIdx = k.indexOf('.'); const type = k.substring(0, dotIdx); const field = k.substring(dotIdx + 1); const key = `Field.${type}.${field}.weight`; const existing = (await weightMgr.get(key)) || 0; await weightMgr.set(key, existing + count); fieldWritten++; }
                    trainingProgress.value = 100; showToast(`训练完成：${classWritten} 个类型，${fieldWritten} 个字段`, 'success');
                } catch (e) { showToast('训练失败: ' + (e.message || e), 'error'); } finally { isTrainingWeight.value = false; }
                event.target.value = '';
            };

            const collapseAll = () => { const setCollapsed = (nodes, val) => { for (const node of nodes) { if (node.children && node.children.length > 0) { node.collapsed = val; setCollapsed(node.children, val); } } }; setCollapsed(rootNodes.value, true); };
            const expandAll = () => { const setCollapsed = (nodes, val) => { for (const node of nodes) { if (node.children && node.children.length > 0) { node.collapsed = val; setCollapsed(node.children, val); } } }; setCollapsed(rootNodes.value, false); };

            window.addEventListener('resize', () => { isMobile.value = isMobileDevice(); });

            const filteredFields = computed(() => { if (!searchQuery.value) return allFields.value; const q = searchQuery.value.toLowerCase(); return allFields.value.filter(f => f.name.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q) || (f.type && f.type.toLowerCase().includes(q)) || (f.doc && f.doc.toLowerCase().includes(q))); });
            const filteredClassList = computed(() => { if (!classSearchQuery.value) return classList.value; const q = classSearchQuery.value.toLowerCase(); return classList.value.filter(cls => cls.name.toLowerCase().includes(q) || cls.displayName.toLowerCase().includes(q) || cls.doc.toLowerCase().includes(q)); });

            return {
                wsUrl, dataDir, connected, isConnecting, connectProgress, isLoadingClasses, isLoadingFields, connectAndInit,
                classList, selectedClass, classId, createInstance, allFields, searchQuery, filteredFields, rootNodes, addFieldToRoot, removeRootNode,

                // 模式与 Schema
                controlCenterOpen, workspaceMode, customClasses, customClassesData, customFields,
                schemaConsoleOpen, schemaConsoleTab, openSchemaConsole, editSchemaClass,
                schemaDraft, startSchemaBuilder, editSchemaMeta, schemaMetaEditorOpen, schemaMetaKey, schemaMetaValue, saveSchemaMeta,
                addSchemaField, editSchemaField, schemaFieldEditorOpen, schemaFieldForm, saveSchemaField, saveAndRegisterSchema, deleteCustomClass, exportSchema, importSchema,

                // Extend Class (AddField)
                extendClassModalOpen, openExtendClassModal, extendFieldForm, saveAndApplyCustomField, deleteCustomField, isSavingField,

                // 全局类型选择器
                typeSelectorOpen, typeSelectorQuery, filteredTypeSelectorItems, openTypeSelector, closeTypeSelector, handleTypeSelect,

                classSelectorVisible, classSearchQuery, filteredClassList, selectAndCreateClass,
                importDialogVisible, exportDialogVisible, importing, importProgress, showImportDialog, showExportDialog, exportJsonFile, importClass,
                collapseAll, expandAll, isDarkMode, toggleTheme,
                
                // 本地项目
                localProjects, saveProjectToDb, loadProjectFromDb, deleteProjectFromDb,

                exportDict, importDict, generateFullDict, restoreBuiltinDict, isGeneratingDict, dictProgress, dictCurrentTask, resetDict, isImportingDict, importDictProgress,
                exportWeightPack, importWeightPack, generateFullWeightPack, restoreBuiltinWeightPack, isGeneratingWeight, weightProgress, weightCurrentTask, resetWeightPack, isImportingWeight, importWeightProgress, trainWeightFromMod, isTrainingWeight, trainingProgress, trainingCurrentTask,
                leftDrawerOpen, openLeftDrawer: () => togglePanel('leftDrawer'), previewOpen, togglePreviewPanel: () => togglePanel('preview'), isMobile, toasts, togglePanel
            };
        }
    });

    app.component('class-tree-node', ClassTreeNode);
    app.component('editor-node', EditorNode);
    app.mount('#app');
});
