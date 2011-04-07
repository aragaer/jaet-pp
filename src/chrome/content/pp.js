var gEIS, gDB, gPC, gPS, gOS;
var tabbox;
var undoBtn, redoBtn;
Components.utils.import("resource://pp/itemtype.js");
Components.utils.import("resource://pp/project.js");
const Queries = {
    getProjName:    "select projectName from projects where projectID=:id;",
    saveProjName:   "replace into projects (projectID, projectName) values (:id, :pname);",
    checkProjName:  "select projectID from projects where projectName=:pname;",
}, Stms = { };

// handlers for right-click menu
const showHide = {
    order:      function (aEvt) {
        let order = tabbox.selectedPanel.orderView;
        order.activeRow = order.treebox.getRowAt(aEvt.clientX, aEvt.clientY);
        document.getElementById('btn-remove').hidden = order.activeRow == -1;
    },
    build:      function (aEvt) {
        let build = tabbox.selectedPanel.buildView;
        build.activeRow = build.treebox.getRowAt(aEvt.clientX, aEvt.clientY);
        if (build.activeRow == -1)
            aEvt.preventDefault();
    },
    buy:        function (aEvt) {
        let buy = tabbox.selectedPanel.buyView;
        buy.activeRow = buy.treebox.getRowAt(aEvt.clientX, aEvt.clientY);
        if (buy.activeRow == -1 || !buy.active.itm)
            aEvt.preventDefault();
        document.getElementById('btn-build').hidden = !ItemType.byID(buy.active.type).bp;
    },
    acquired:   function (aEvt) {
        let acquired = tabbox.selectedPanel.acquiredView;
        acquired.activeRow = acquired.treebox.getRowAt(aEvt.clientX, aEvt.clientY);
        if (acquired.activeRow == -1 || !acquired.active.itm)
            aEvt.preventDefault();
    },
    spent:      function (aEvt) { },
};



function addToProject1() {
    var params = {in: {dlg: 'add-to-proj'}, out: null};
    openDialog("chrome://pp/content/pp_dlg.xul", "", "chrome,dialog,modal", params).focus();
    if (!params.out.count)
        return;
    tabbox.selectedPanel.project.addToOrder(params.out.typeID, params.out.count);
}

function removeFromProject1() {
    let project = tabbox.tabpanels.selectedPanel.project;
    let order = tabbox.tabpanels.selectedPanel.orderView;
    let buy = tabbox.tabpanels.selectedPanel.buyView;
    let item = order.active;
    if (project.buy[item.type] <= 0) {
        alert("Can't remove item from project - not in 'to buy' list!");
        return;
    }
    var params = {in: {dlg: 'buy-build', amount: project.buy[item.type]}};
    openDialog("chrome://pp/content/pp_dlg.xul", "", "chrome,dialog,modal", params).focus();
    if (!params.out.count)
        return;
    project.addToOrder(item.type, -params.out.count);
}

/* move from 'to buy' to 'to build' or vice versa */
function buyBuild(action) {
    let project = tabbox.tabpanels.selectedPanel.project;
    let build = tabbox.tabpanels.selectedPanel.buildView;
    let buy = tabbox.tabpanels.selectedPanel.buyView;
    let src = action == 'buy' ? build : buy;
    if (!src.active)
        return;
    var params = {in: {dlg: 'buy-build', amount: src.active.cnt}};
    openDialog("chrome://pp/content/pp_dlg.xul", "", "chrome,dialog,modal", params).focus();
    if (!params.out.count)
        return;
    project.wantToBuild(src.active.type, action == 'build' ? params.out.count : -params.out.count);
}

function gotIt1(spend_isk) {
    let project = tabbox.tabpanels.selectedPanel.project;
    let buy = tabbox.tabpanels.selectedPanel.buyView;
    let itm = buy.active;
    var params = {in: buy.isBlueprint(buy.activeRow)
        ? {dlg: 'blueprint', price: spend_isk ? ItemType.byID(itm.type).price : 0}
        : {dlg: 'buy-build', amount: itm.cnt, price: spend_isk ? ItemType.byID(itm.type).price : 0}
    };
    openDialog("chrome://pp/content/pp_dlg.xul", "", "chrome,dialog,modal", params).focus();
    if (!params.out.count)
        return;
    if (!params.out.cost)
        params.out.cost = 0; // Remove the warning
    if (params.in.dlg == 'blueprint')
        project.gotBP(itm.type, params.out.count, params.out.me || 0, params.out.cost);
    else
        project.gotItem(itm.type, params.out.count, params.out.cost);
}

function keepIt1(spend_isk) {
    let project = tabbox.selectedPanel.project;
    let acquired = tabbox.selectedPanel.acquiredView;
    let itm = acquired.active;
    var params = {in: acquired.isBlueprint(acquired.activeRow)
        ? {dlg: 'blueprint', price: spend_isk ? ItemType.byID(itm.type).price : 0, me : itm.me}
        : {dlg: 'buy-build', amount: itm.cnt, price: spend_isk ? ItemType.byID(itm.type).price : 0}
    };
    openDialog("chrome://pp/content/pp_dlg.xul", "", "chrome,dialog,modal", params).focus();
    if (!params.out.count)
        return;
    if (!params.out.cost)
        params.out.cost = 0; // Remove the warning
    if (params.in.dlg == 'blueprint')
        project.gotBP(itm.type, -params.out.count, itm.me, params.out.cost);
    else
        project.gotItem(itm.type, -params.out.count, params.out.cost);
}

function builtIt1() {
    let project = tabbox.selectedPanel.project;
    let build = tabbox.selectedPanel.buildView;
    let itm = build.active;
    var type = ItemType.byID(itm.type);
    var params = {in: {itm: itm, type: type, pr: project}};
    openDialog("chrome://pp/content/pp_build.xul", "", "chrome,dialog, modal", params).focus();
    if (!params.out || !params.out.cnt)
        return;
    params.out.bp.type = type.bp;
    for (let [i, c] in Iterator(params.out.needed))
        project.spentItem(i, c);
    project.spentBP(params.out.bp, params.out.cnt);
    project.builtItem(itm.type, params.out.cnt); // This one stores states, thus it's the last one
}

function init() {
    if (gEIS)
        return;
    gEIS = Cc["@aragaer/eve/inventory;1"].getService(Ci.nsIEveInventoryService);
    gDB  = Cc["@aragaer/eve/db;1"].getService(Ci.nsIEveDBService);
    gPC  = Cc["@aragaer/eve/market-data/provider;1?name=eve-central"].
            getService(Ci.nsIEveMarketDataProviderService);
    gPS  = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
    gOS = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    var conn = gDB.getConnection();
    tabbox = document.getElementById('tabbox');
    if (!conn.tableExists('projects'))
        conn.createTable('projects', 'projectID integer primary key autoincrement not null, ' +
            'projectName char, projectDescr char, projectData char');

    for (var i in Queries)
        try {
            Stms[i] = conn.createStatement(Queries[i]);
        } catch (e) {
            dump("production planner '"+Queries[i]+"': "+e+"\n"+conn.lastErrorString+"\n");
        }

    for (var i in showHide)
        document.getElementById(i+'-menu').addEventListener('popupshowing', showHide[i], true);

    gOS.addObserver({
        observe: function (aSubject, aTopic, aData) {
            var bool = aSubject.QueryInterface(Ci.nsISupportsPRBool);
            if (aTopic == 'quit-application-requested')
                bool.data = ppPrepareQuit() || bool.data;
        }
    }, 'quit-application-requested', false);

    undoBtn = document.getElementById("Edit:Undo");
    redoBtn = document.getElementById("Edit:Redo");
}

function ppOnload() {
    init();
    for each (var id in getCharPref('jaet.production_planner.tabs', '').split(',')) if (id)
        openPanel(id);
}

function openPanel(id) {
    var name, stm;
    if (id) {
        let stm = Stms.getProjName;
        try {
            stm.params.id = id;
            if (stm.step())
                name = stm.row.projectName;
            else
                return gPS.alert(null, "Project not found", "Project "+id+" is not found");
        } catch (e) {
            println("getNameStm: "+e);
        } finally {
            stm.reset();
        }
    } else
        name = "New project";

    var tabpanel = document.createElement('tabpanel');
    tabpanel.className = 'project';
    tabpanel.setAttribute('flex', 1);
    tabpanel.setAttribute('orient', 'vertical');
    var project = tabpanel.project = new Project(tabpanel);
    project.undoBtn = undoBtn;
    project.redoBtn = redoBtn;

    var item = tabbox.tabs.appendItem(name, id);
    tabbox.tabpanels.appendChild(tabpanel);
    tabpanel.init(id || -1-Math.floor(100*Math.random()));
    if (id)
        project.load(id);
    tabbox.selectedIndex = tabbox.tabs.getIndexOfItem(item);
}

const projectList = {
    __iterator__:   function () {
        var tp = tabbox.tabpanels.firstChild;
        var t = tabbox.tabs.firstChild;
        while (tp) {
            yield {panel: tp, tab: t};
            tp = tp.nextSibling;
            t = t.nextSibling;
        }
    }
}

function confirmSave() {
    let project = tabbox.selectedPanel.project;
    var flags = gPS.BUTTON_POS_0 * gPS.BUTTON_TITLE_SAVE |
        gPS.BUTTON_POS_1 * gPS.BUTTON_TITLE_IS_STRING |
        gPS.BUTTON_POS_2 * gPS.BUTTON_TITLE_CANCEL;
    return gPS.confirmEx(null, "Not saved", "Project '"+tabbox.selectedTab.label+
            "' is not saved\nDiscard changes?", flags, "", "Discard", "", null, {});
}

/* returns true if quit have to be cancelled */
function ppPrepareQuit() {
    var panelList = [];
tabpanels:
    for each (var p in projectList) {
        let project = p.panel.project;
        tabbox.selectedPanel = p.panel;
        tabbox.selectedTab = p.tab;
        while (!project.saved) {
            switch (confirmSave()) {
            case 0:
                save();
                break;
            case 1:
                if (project.id)
                    panelList.push(project.id);
                continue tabpanels;
            case 2:
                return true;
            }
        }
        panelList.push(project.id);
    }
    Prefs.setCharPref('jaet.production_planner.tabs', panelList.join(','));
    return false;
}

function save() {
    let project = tabbox.selectedPanel.project;
    if (project.id === undefined) {
        var name, id;
        while (!name) {
            var tmp = {value: 'New project'};
            if  (!gPS.prompt(null, "Save project", "Enter a name", tmp, null, {}))
                return;
            name = tmp.value;
            let (stm = Stms.checkProjName) {
                stm.params.pname = name;
                id = stm.step() ? stm.row.projectID : 0;
                stm.reset();
                if (id && !confirm("You already have a project named "+name+"\nOverwrite?"))
                    name = null;
            }
        }
        if (!id) {
            let (stm = Stms.saveProjName) {
                stm.params.pname = name;
                stm.execute();
                stm.reset();
            }
            let (stm = Stms.checkProjName) {
                stm.params.pname = name;
                stm.step();
                id = stm.row.projectID;
                stm.reset();
            }
        }
        project.id = id;
        tabbox.selectedTab.label = name;
    }
    project.save();
}

function open() {
    var params = {in:{}};
    openDialog("chrome://pp/content/dialogs/pp.xul", null, "chrome,dialog,modal", params).focus();
    if (!params.out)
        return;
    for each (var p in projectList) if (p.panel.project.id == params.out.id) {
        tabbox.selectedPanel = p.panel;
        tabbox.selectedTab = p.tab;
        return;
    }
    openPanel(params.out.id);
}

function close() {
    let project = tabbox.selectedPanel.project;
    if (!project.saved)
        switch (confirmSave()) {
            case 0: save(); break;
            case 1: break;
            case 2: return;
        }
    var currentIndex = tabbox.selectedIndex;
    tabbox.tabpanels.removeChild(tabbox.selectedPanel);
    tabbox.tabs.removeItemAt(currentIndex);
    if (currentIndex == 0 && tabbox.tabs.childNodes.length > 0)
        tabbox.selectedIndex = 0;
    else
        tabbox.selectedIndex = currentIndex - 1;
}



