/* market data module */
EXPORTED_SYMBOLS=["MDM"];
const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://gre/modules/Services.jsm");

const providers = {};
const variables = {};
const profiles = {};

function makeExtractFunction(field) {
    var subfields = field.split('/');
    return function (data) {
        data = data.wrappedJSObject;
        for each (var f in subfields)
            data = data[f];
        return data;
    };
}

function mdm_variable(name, provider, field, desc, tag, params) {
    this._name = name;
    this._provider = provider;
    this._field = field;
    this._desc = desc;
    this._params = params;
    this._tag = tag;
    this._extract = makeExtractFunction(this._field);
    dump("Registered variable ["+name+"]\n");
}

mdm_variable.prototype = {
    get name()      this._name,
    get provider()  this._provider,
    get field()     this._field,
    get params()    this._params,

    _name:          '',
    _desc:          '',
    _provider:      null,
    _field:         '',
    _params:        {},
    _tag:           '',
    _extract:       function () null,

    invokeForTypeID:        function (typeID) {
        var data = this._provider.getPriceForItem2(typeID, {wrappedJSObject: this._params});
        return this._extract(data);
    },

    invokeForTypeIDAsync:   function (typeID, handler) {
        var self = this;
        return this._provider.getPriceForItemAsync2(typeID, {wrappedJSObject: this._params},
                function (data) handler(self._extract(data)));
    },
};

function makeEvaluateFunction(formula) {
    var _variables = {};
    var varlist = [];
    var results;
    var _res;
    dump("Analyzing formula ["+formula+"]\n");
    formula = formula.replace(/{(.*)}/g, function (str, tag, offset, s) {
        _variables[tag] = 1;
        return 'results["'+tag+'"]';
    });
    formula = "_res = " + formula;
    varlist = [i for (i in _variables)];
    _variables = {};

    return function (typeID) {
        _res = undefined;
        results = {};
        [results[tag] = variables[tag].invokeForTypeID(typeID) for each (tag in varlist)];
        try {
            eval(formula);
        } catch (e) {
            dump("Evaluating formula ["+formula+"]: "+e+"\n");
        }
        return _res;
    };
}

function mdm_profile(name, formula) {
    this._name = name;
    this._formula = formula;
    this._evaluate = makeEvaluateFunction(formula);
}

mdm_profile.prototype = {
    _name:      '',
    _formula:   '',
    _evaluate:  function () null,

    getPriceForTypeID:      function (typeID) {
        return this._evaluate(typeID);
    },
};


MDM = {
    createVariable: function (name, provName, field, desc, tag, params, force) {
        if (force || !variables[tag])
            variables[tag] = new mdm_variable(name, providers[provName], field, desc, tag, params);
    },
    retagVariable:  function (oldTag, newTag, force) {
        let variable = variables[oldTag];
        if (!variable)
            return;
        if (!force && variables[newTag])
            return;
        variables[newTag] = variable;
        variable.tag = newTag;
        delete variable;
    },
    createProfile:  function (name, formula) {
        profiles[name] = new mdm_profile(name, formula);
        return profiles[name];
    },
};

function registerProvider(providerName) {
    var prov = Cc["@aragaer/eve/market-data/provider;1?name="+providerName].
            getService(Ci.nsIEveMarketDataProviderService);
    providers[prov.name] = prov;
    dump("Created provider ["+prov.name+"]\n");
    var prov_enum = prov.provides.enumerate();
    while (prov_enum.hasMoreElements()) {
        var field = prov_enum.getNext();
        if (!field || !field.wrappedJSObject)
            next;
        field = field.wrappedJSObject;
        var name = prov.name+'->'+field.name;
        variables[name] = new mdm_variable(name, prov, field.name, field.desc, name, {});
    }
    dump("Provider '"+providerName+"' registered succesfully\n");
}

var observer = {
    observe:    function (aSubject, aTopic, aData) {
        switch (aTopic) {
        case 'eve-market-provider-init':
            registerProvider(aData);
            break;
        default:
            break;
        }
    },
};

Services.obs.addObserver(observer, 'eve-market-provider-init', false);

Services.obs.notifyObservers(null, 'eve-market-init', null);

