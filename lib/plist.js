;(function (exports, sax, xmlbuilder) {
 //Checks if running in a non-browser environment
  var inNode = typeof window === 'undefined' ? true : false;

  function Parser() {
    sax.SAXParser.call(this, false, { lowercasetags: true, trim: false });
  }

  var inherits = null;
  if (inNode) {
    var fs = require('fs');
    inherits = require('util').inherits; //use node provided function
  } else { //use in browser
    if ("create" in Object) {
      inherits = function(ctor, superCtor) {
        ctor.super_ = superCtor;
        ctor.prototype = Object.create(superCtor.prototype, {
          constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
      };
    } else {
      var klass = function() {};
      inherits = function(ctor, superCtor) {
        klass.prototype = superCtor.prototype;
        ctor.prototype = new klass;
        ctor.prototype['constructor'] = ctor;
      }
    }
  }
  inherits(Parser, sax.SAXParser); //inherit from sax (browser-style or node-style)

  Parser.prototype.getInteger = function (string) {
    this.value = parseInt(string, 10);
  }
  Parser.prototype.getReal = function (string) {
    this.value = parseFloat(string);
  }
  Parser.prototype.getString = function (string) {
    this.value += string;
  }
  Parser.prototype.getData = function(string) {
    // todo: parse base64 encoded data
    this.value += string;
  }
  Parser.prototype.getDate = function (string) {
    this.value = new Date(string);
  }

  Parser.prototype.addToDict = function (value) {
    this.dict[this.key] = value;
  }
  Parser.prototype.addToArray = function (value) {
    this.array.push(value);
  }

  Parser.prototype.onopentag = function (tag) {
    switch (tag.name) {
      case 'dict':
        this.stack.push(this.context);
        this.context = {
          value: function() {
            return this.dict;
          },
          dict: {},
          setKey: function(key) {
            this.key = key;
          },
          setValue: function(value) {
            this.dict[this.key] = value;
          }
        }
        break;
      case 'plist':
      case 'array':
        this.stack.push(this.context);
        this.context = {
          value: function() {
            return this.array;
          },
          array: [],
          setKey: function(key) {
            console.log('unexpected <key> element in array');
          },
          setValue: function(value) {
            this.array.push(value);
          }
        }
        break;
      case 'key':
        this.ontext = function (text) {
          this.context.setKey(text);
        }
        break;
      case 'integer':
        this.ontext = this.getInteger;
        break;
      case 'real':
        this.ontext = this.getReal;
        break;
      case 'string':
        this.value = '';
        this.ontext = this.getString;
        this.oncdata = this.getString;
        break;
      case 'data':
        this.value = '';
        this.ontext = this.getData;
        this.oncdata = this.getData;
        break;
      case 'true':
        this.value = true;
        break;
      case 'false':
        this.value = false;
        break;
      case 'date':
        this.ontext = this.getDate;
        break;
      default:
        console.log('ignored tag', tag.name);
        break;
    }
  }
  Parser.prototype.onclosetag = function (tag) {
    var value;
    switch (tag) {
      case 'dict':
      case 'array':
      case 'plist':
        var value = this.context.value();
        this.context = this.stack.pop();
        this.context.setValue(value);
        break;
      case 'true':
      case 'false':
      case 'string':
      case 'integer':
      case 'real':
      case 'date':
      case 'data':
        this.context.setValue(this.value);
        break;
      case 'key':
        break;
      default:
        console.log('closing', tag, 'tag ignored');
    }
    this.oncdata = this.ontext = this.checkWhitespace;
  }
  Parser.prototype.checkWhitespace = function (data) {
    if (!data.match(/^[ \t\r\n]*$/)) {
      console.log('unexpected non-whitespace data', data);
    }
  }
  Parser.prototype.oncomment = function (comment) {
  }
  Parser.prototype.onerror = function (error) {
    console.log('sax parser error:', error);
    throw error;
  }

  if (inNode) Parser.prototype.parseFile = function (xmlfile, callback) { //browsers aren't capable of opening files, instead use AJAX
    var parser = this;
    parser.stack = [ ];
    parser.context = {
      callback: callback,
      value: function() {},
      setKey: function(key) {},
      setValue: function(value) {
        callback(null, value);
      },
    }
    var rs = fs.createReadStream(xmlfile, {
      encoding: 'utf8'
    });
    rs.on('data', function(data) { parser.write(data); });
    rs.on('end', function() { parser.close(); });
  }

  Parser.prototype.parseString = function (xml, callback) {
    var parser = this;
    parser.stack = [ ];
    parser.context = {
      callback: callback,
      value: function() {},
      setKey: function(key) {},
      setValue: function(value) {
        this.callback(null, value);
      },
    };
    parser.write(xml);
    parser.close();
  }

  exports.Parser = Parser;

  exports.parseString = function (xml, callback) {
    var parser = new Parser();
    parser.parseString(xml, callback);
  }

  if (inNode) exports.parseFile = function (filename, callback) { //Do not expose no created method
    var parser = new Parser();
    parser.parseFile(filename, callback);
  }
  
  exports.build = function (obj) {
      var XMLHDR = { 'version': '1.0','encoding': 'UTF-8'};
      var XMLDTD = { 'ext': 'PUBLIC \"-//Apple Computer//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"'};
      var doc = xmlbuilder.create();
      var child = doc.begin('plist', XMLHDR, XMLDTD).att('version', '1.0').ele('dict');
      var stack = [];
      reflect(obj);
      return doc;
      
      function ISODateString(d){  
        function pad(n){return n<10 ? '0'+n : n}  
        return d.getUTCFullYear()+'-'  
            + pad(d.getUTCMonth()+1)+'-'  
            + pad(d.getUTCDate())+'T'  
            + pad(d.getUTCHours())+':'  
            + pad(d.getUTCMinutes())+':'  
            + pad(d.getUTCSeconds())+'Z'  
      }

      function reflect(o) {
          prev = null;
          var name;
          for (name in o) {
              if (typeof o[name]!== 'function') {
                  if (typeof o[name]=== 'object') {
                      if (o[name] instanceof Date) {
                          child = child.ele('key').txt(name).up().ele('date').raw(ISODateString(new Date(o[name]))).up();
                      } else {
                          if (o[name] instanceof Array) {
                                prev = 'array';
                                child = child.ele('key').txt(name).up().ele('array'); 
                            }  else {
                                if (stack[stack.length-1] instanceof Array) {
                                    child = child.ele('dict'); 
                                } else {
                                    child = child.ele('key').txt(name).up().ele('dict'); 
                                }
                            }
                            stack.push(o[name]);
                            reflect(o[name]);
                      } 
                  } else {
                      child.ele('key').raw(name);
                      if ((typeof o[name]) === 'boolean') {
                          child.ele(o[name]);
                      } else if ((typeof o[name]) === 'number') {
                          child.ele((o[name] % 1 === 0) ? 'integer' : 'real').txt(o[name]);
                      } else {
                          var tok = o[name];
                          // TODO this is sloppy base64 detection, use Buffer
                          var base64Matcher = new RegExp("^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$");
                          if (base64Matcher.test(tok.replace(/\s/g,'')) && (tok.length>125)) {
                              child.ele('data').raw(tok);
                          } else {
                              child.ele('string').raw(tok);
                          }
                      }
                  }
              }
          }
          stack.pop();
          child = child.up();
      }
  }
  
})(typeof exports === 'undefined' ? plist = {} : exports, typeof window === "undefined" ? require('sax') : sax, typeof window === "undefined" ? require('xmlbuilder') : xmlbuilder)
//the above line checks for exports (defined in node) and uses it, or creates a global variable and exports to that.
//also, if in node, require sax node-style, in browser the developer must use a <script> tag to import sax
// TODO: Implement detection of 'sax' in the Browser environment
