EXPORTED_SYMBOLS=["Project"];
const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://pp/itemtype.js");
const MAX_UNDO = 10;
const Queries = {
    saveProj:       "update projects set projectData=:pdata where projectID=:id",
    loadProj:       "select projectData from projects where projectID=:id",
}, Stms = { };

const projFields = 'buy bp_buy order blueprints acquired build spent'.split(' ');
function Project(box) {
    this.box = box;
    for each (var i in projFields)
        this[i] = {};
    this._states = [];
    this._store();
}
Project.prototype = {
    _savedstate:    -1,
    _curstate:      -1,
    _store:         function () {
        var tmp = {};
        for each (var i in ['order', 'blueprints', 'acquired', 'build', 'spent'])
            tmp[i] = this[i];
        this._states = this._states.slice(0, this._curstate + 1);
        this._states.push(JSON.stringify(tmp));
        if (this._states.length > MAX_UNDO) {
            this._savedstate -= this._states.length - MAX_UNDO;
            this._states = this._states.slice(this._states.length - MAX_UNDO);
        }
        this._curstate = this._states.length - 1;
    },
    undo:           function () this.curstate--,
    redo:           function () this.curstate++,
    undoBtn:        null,
    redoBtn:        null,
    get curstate()  this._curstate,
    set curstate(i) {
        if (i < 0 || i >= this._states.length)
            return;
        this._curstate = i;
        if (this.undoBtn)
            this.undoBtn.disabled = i == 0;
        if (this.redoBtn)
            this.redoBtn.disabled = i == this._states.length - 1;
        var tmp = JSON.parse(this._states[i]);
        for (var l in tmp)
            this[l] = tmp[l];
        for each (var bp in this.blueprints) if (!bp.cnt)
            bp.cnt = Infinity;
        this.box.rebuild();
    },
    get saved()     this._savedstate == this._curstate,
    addToOrder:     function (typeID, count) {
        safeAdd(this.order, typeID, count);
        this.box.orderView.rebuild();
        this.box.buyView.rebuild();
        this._store();
    },
    spentItem:      function (typeID, count) {
        var realcnt = safeGet(this.acquired, typeID);
        realcnt -= count;
        if (realcnt > 0)
            safeAdd(this.acquired, typeID, -count);
        else {
            delete(this.acquired[typeID]);
            safeAdd(this.spent, typeID, -realcnt);
        }
    },
    builtItem:      function (typeID, count) {
        if (count > this.build[typeID].cnt) {
            alert("Error: trying to build " + count + " items, but only " + this.build[typeID].cnt + " are scheduled");
            return;
        }
        safeAdd(this.build, typeID, -count);
        safeAdd(this.acquired, typeID, count);
        this.box.rebuild();
        this._store();
    },
    getBPMEList:    function (typeID) {
        let {bp:bpID, tl:tl} = ItemType.byID(typeID);
        for each (var bp in [i for each (i in this.blueprints) if (i.type == bpID)].
                sort(function (a, b) b.me - a.me))
            yield {cnt: bp.cnt, me: bp.me};
        yield {cnt: Infinity, me: tl == 2 ? -4 : 0, fake: true};
    },
    wantToBuild:    function (typeID, count) { // count can be negative
        safeAdd(this.build, typeID, count);
        this.box.buildView.rebuild();
        this.box.buyView.rebuild();
        this._store();
    },
    gotItem:        function (typeID, count, cost) {
        safeAdd(this.acquired, typeID, count);
        if (cost)
            safeAdd(this.spent, 'isk', count > 0 ? cost : -cost);
        else
            safeAdd(this.spent, typeID, count);
        this.box.buyView.rebuild();
        this.box.acquiredView.rebuild();
        this.box.spentView.rebuild();
        this._store();
    },
    gotBP:          function (bpID, runs, me, cost) { // TODO: Can't see here code involving 'cost'
        var id = bpID+'_'+me;
        if (!this.blueprints[id])
            this.blueprints[id] = {type : bpID, me: me, cnt: 0};
        this.blueprints[id].cnt += runs;
        if (!this.blueprints[id].cnt) // BP removed
            delete(this.blueprints[id]);

        if (runs !== Infinity) {
            safeAdd(this.spent, bpID, runs);
            if (this.spent[bpID])
                this.spent[bpID].isBP = true;
        }
        this.box.buyView.rebuild();
        this.box.acquiredView.rebuild();
        this.box.spentView.rebuild();
        this._store();
    },
    spentBP:        function (bp, runs) { // bp is actually an object pointing to a blueprint
        if (bp.fake) {
            safeAdd(this.spent, bp.type, runs);
            if (this.spent[bp.type])
                this.spent[bp.type].isBP = true;
            return;
        }
        dump(JSON.stringify(bp)+"\n");
        dump(JSON.stringify(this.blueprints)+"\n");
        var id = bp.type+'_'+bp.me;
        var rbp = this.blueprints[id];
        rbp.cnt -= runs;
        if (!rbp.cnt)
            delete(this.blueprints[id]);
    },
    load:           function (id) {
        let stm = Stms.loadProj;
        stm.params.id = this.id = id;
        try {
            stm.step();
            this._states = [stm.row.projectData];
        } catch (e) { println("Load project "+id+": "+e); } finally { stm.reset(); }
        this.curstate = this._savedstate = 0;
    },
    save:           function (id) {
        id = id || this.id;
        let stm = Stms.saveProj;
        try {
            stm.params.id = id;
            stm.params.pdata = this._states[this._curstate];
            stm.execute();
            this._savedstate = this._curstate;
        } catch (e) { println("Save project "+id+": "+e); } finally { stm.reset(); }
    },
};

function safeAdd(list, id, cnt) {
    if (!list[id])
        list[id] = {type: id, cnt: 0};
    list[id].cnt += cnt;
    if (!list[id].cnt)
        delete(list[id]);
}

function safeGet(list, id)
    list[id]
        ? list[id].cnt
        : 0;

var gDB  = Cc["@aragaer/eve/db;1"].getService(Ci.nsIEveDBService);
var conn;
try {
    conn = gDB.getConnection();
} catch (e) {
    conn = null;
}

if (!conn) {
    Services.obs.addObserver({
        observe: function (aSubject, aTopic, aData) {
            try {
                conn = aSubject.QueryInterface(Ci.mozIStorageConnection);
                init();
            } catch (e) {
                dump("error in project.js module: "+e+"\n");
                if (conn)
                    dump(conn.lastErrorString+"\n");
            }
            Services.obs.removeObserver(this);
        }
    }, 'eve-db-init', false);
} else
    init();



function init() {
    [Stms[i] = conn.createStatement(Queries[i]) for (i in Queries)];
}

