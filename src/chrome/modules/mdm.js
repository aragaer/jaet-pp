/* market data module */
EXPORTED_SYMBOLS=["MDM"];
const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource://gre/modules/Services.jsm");

var providers = {};
var variables = {};

function makeExtractFunction(field) {
    var subfields = field.split('/');
    return function (data) {
        data = data.wrappedJSObject;
        for each (var f in subfields)
            data = data[f]
        return data;
    };
}

function mdm_variable(name, provider, field, desc, params) {
    this._name = name;
    this._provider = provider;
    this._field = field;
    this._desc = desc;
    this._params = params;
    this._extract = makeExtractFunction(this._field);
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
        var data = this._provider.getPriceForItem2(typeID, params);
        return this._extract(data);
    },

    invokeForTypeIDAsync:   function (typeID, handler) {
        var self = this;
        return this._provider.getPriceForItemAsync2(typeID, params,
                function (data) handler(self._extract(data)));
    },
};

function MDM() {}

MDM.prototype = {
};

function registerProvider(providerName) {
    var prov = Cc["@aragaer/eve/market-data/provider;1?name="+providerName].
            getService(Ci.nsIEveMarketDataProviderService);
    providers[prov.name] = prov;
    var prov_enum = prov.provides.enumerate();
    while (prov_enum.hasMoreElements()) {
        var field = prov_enum.getNext();
        if (!field || !field.wrappedJSObject)
            next;
        field = field.wrappedJSObject;
        var name = prov.name+'->'+field.name;
        variables[name] = new mdm_variable(name, prov, field.name, field.desc, {});
        dump("Registered variable ["+name+"]\n");
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

