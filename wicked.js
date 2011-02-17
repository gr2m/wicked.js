// wicked.js is a module manager for Javascript. It loads external JavaScript functions (Modules)
// across domains and caches its code using localStorage for faster future loadinging.
// 
// The script used to inject miteGyver is wicked.js which is used to load, cache & update
// miteGyver and also used by miteGyver itself to load assets as needed by the current website.
// 
//### Example Usage
// 
//     wicked = new Wicked;
//     wicked.get("myWickedFunction","http://example.com/my_wicked_function.js", function(myWickedFunction){
//       var instance = new myWickedFunction({foo: 'bar'});
//       instance.showSomethingWicked();
//     })
// 
//### Advanced Example
// 
//     you can even make wicked.js being part of the module managment as well. Just wrap the script once more:
// 
//     wicked = new Wicked;
//     wicked.get("Wicked","http://example.com/lib/wicked.js", function(Wicked){
//       var wicked = new Wicked({check_interval: 3600})
//       wicked.get("myWickedFunction","http://example.com/my_wicked_function.js", function(myWickedFunction){
//         var instance = new myWickedFunction({foo: 'bar'});
//         instance.showSomethingWicked();
//       });
//     });
//    
//### Parameters
// 
// * **namespace** (optional, default: 'wicked')
//   namespace is prepended to all localStorage keys used for caching.
// 
// * **salt** (optional, default: Math.random())
//   crc32 checksums are stored among with the Modules in order to avoid manipulation
//   and to allow checks for updates.
// 
// * **check_interval** in seconds (optional, default: 3600)
//   if check_interval is set, modules get updated automatically in background

Wicked = function(cfg) {
  cfg = cfg || {};
  var namespace      = cfg.namespace   || 'wicked',
      salt           = String(cfg.salt || Math.random()),
      check_interval = (cfg.check_interval || 3600) * 1000,
      modules        = {},
      Store          = window.localStorage,
      load_queues    = {},
      self           = this;
  
  // localStorage support is required
  if (typeof Store == 'undefined') {
    alert('wicked.js FATAL ERROR: Your Browser does not support localStorage.');
    return;
  }
  
  var init = function() {
    
    // activate autoupdating, if check_interval is set
    if (check_interval) {
      // but give it 5 sec before the first check
      window.setTimeout(self.check_for_updates, 5000);
    }
  };
  
  // load & cache a JS function called »module« located at »url« and
  // run callback passing the module as soon as it is available.
  this.get = function(module, url, callback) {

    // is the module already loaded? Sweet, that was fast.
    if (typeof modules[module] == 'function') {
      callback(modules[module]);
      return;
    }

    // Is module already cached? Wicked! check it's checksum and return it.
    var code;
    if (code = read_from_cache(module)) {
      eval_module(module, code);
      callback(modules[module]);
      return;
    }
    
    // Is the desired Module already present? Not bad!
    // Let's return it right away & cache it for the future
    if (typeof find_function(module) == 'function') {
      code = find_function(module).toString();
      
      // **NOTE**  
      // Due to a Greasemonkey issue I couldn't figure out yet,
      // it's not possible to simply use:
      // 
      //    modules[module] = find_function(module);
      
      // save Module, cache its code and run callback
      eval_module(module, code);
      write_to_cache(module, url, code);
      callback(modules[module]);
      return;
    }

    // Okay, this module is new, so let's load it.
    load(url, function(event) {
      
      // Did something went wrong?
      if (! event.target) {
        self.onerror('LOAD ERROR: could not load ' + url);
        return false;
      }

      // Or does the function »module« not exist at »url«?
      if (! find_function(module)) {
        self.onerror('LOAD ERROR: There is no method '+module+' at ' + url);
        return false;
      }
      
      // Okay, all good. Let's return the module and cache its code for future usage.
      code = find_function(module).toString();
      write_to_cache(module, url, code);
      eval_module(module, code);
      callback(modules[module]);
    });
  };
  
  // The wicked.check allows us to reload a module and compare its checksum with the one
  // we have stored locally. In case the module has been updated, return all that's necessary
  // to update it.
  this.check = function(module, callback) {
    
    // get module's source URL
    var url = Store[ [namespace, module, 'url'].join('_') ];
    
    // avoid errors in case the module is unknown or localStorage has been cleared meanwhile
    if (!url) {
      callback(false);
      return false;
    }
    
    // load the script
    load(url, function(event) {
      
      // Did something went wrong?
      if (! event.target) {
        self.onerror('CHECK ERROR: could not check for update at ' + url);
        return false;
      }
  
      // Or does the function »module« not exist at »url«?
      if (! find_function(module)) {
        self.onerror('CHECK ERROR: There is no method '+module+' at ' + url);
        return false;
      }
      
      // Wicked! Get the code of the module to calculate its checksum.
      var their_code = find_function(module).toString();
      
      // did it change?
      if (crc32( their_code, salt ) == Store[ [namespace, module, 'crc'].join('_') ]) {
        
        // no? Then return nothing.
        callback(false);
      } else {
        
        // Oh yes? Then return all that's necessary to update it.
        callback(true, module, url, their_code);
      };
    });
  };
  
  // make the wicked.check and update the module if it changed.  
  // Updates take effect after the next page load.
  this.update = function(module, callback) {
    this.check(module, function(changed, module, url, code) {
      if (changed) write_to_cache(module, url, code);
      if (typeof callback == 'function') callback(changed);
    });
  };
  
  // walk through all cached modules and make the wicked.check to find out if they have changed.
  // return a callback that just needs to be run for an update
  this.check_all = function(callback) {
    var queue   = 0,
        changed = [];
    for(var module in modules) {
      queue++;
      this.check(module, function(has_changed, module, url, code) {
        queue--;
        if (has_changed) {
          changed.push({module: module, url: url, code: code});
          write_to_cache(module, url, code);
        }
        if (queue == 0) {
          callback(changed.length > 0, function(callback) {
            for (var i=0; i < changed.length; i++) {
              write_to_cache(changed[i].module, changed[i].url, changed[i].code);
              if (typeof callback == 'function') callback();
            }; 
          });
        }
      });
    }
  };
  
  // walk through all cached modules, make the wicked.check and update the ones that have changed  
  // Updates take effect after the next page load.
  this.update_all = function(callback) {
    this.check_all(function(changed, do_update) {
      if (changed) do_update();
      if (typeof callback == 'function') callback(changed);
    });
  };
  
  // Check each check_interval for new updates. If there are updated files, do the update immediately. 
  this.check_for_updates = function() {
    var now       = function() { return (new Date).getTime(); },
        store_key = [namespace, 'last_check'].join('_'),
        _check = function() {
          self.update_all();
          Store[ store_key ] = now();
        };
    if (! Store[ store_key ]) Store[ store_key ] = now();
    
    timeout = Store[ store_key ] - now() + check_interval; 
    
    // Make sure to give it at least 5 seconds before the first check.
    if (timeout < 5000) timeout = 5000;
    
    // start initial Timout and subsequent Intervals to check for updates
    window.setTimeout(function() {
      _check();
      window.setInterval(_check, check_interval);
    }, timeout);
  };
  

  // spring cleaning!
  this.flush = function(key) {
    if (key) {
      Store.removeItem([namespace,key].join('_'));
      Store.removeItem([namespace,key,'crc'].join('_'));
    } else {
      for (var i=0; i < my_keys().length; i++) {
        Store.removeItem(my_keys(i));
      };
    }
  };
  
  
  // error handler – feel free to overwrite
  this.onerror = function(msg) { alert(msg); };
  
  //### PRIVATE
  
  // Adds a script tag to load the external Javascript and run the callback as soon as it's loaded
  // or in case of an error. It's also smart enough not to add the same JavaScript twice if gets
  // loaded multiple times while the JavaScript is still transfered asynchronously.
  var load = function(url, callback) {
    if (! load_queues[url]) {
      load_queues[url] = [];
      
      var script = document.createElement('script');
      script.src = url + '?' + Math.random();
      script.className = namespace;
      script.onload = script.onerror = function(event) {
        var callback;
        while ( callback = load_queues[url].shift() ) {
          callback(event); 
        }
        delete load_queues[url];
      };
      document.body.appendChild(script);
    }
    load_queues[url].push(callback);
  };

  // try to read the Module from cache. Returns false if the Module is not cached or if a
  // bad guy triet to manipulate it.
  var read_from_cache = function(module) {

    var key       = [namespace, module].join('_'),
        crc32_key = [key, 'crc'].join('_');
    
    // already cached?
    if (! Store[key] || !Store[crc32_key]) return false;
    
    // did someone touch it?
    if (crc32( Store[key], salt) != Store[crc32_key]) return false;

    // wicked, return the Module Code from local Cache.
    return Store[key];
  };

  // cache a Module in the locally. Besides the Module's code do also save
  // its url for update checks and a checksum for security reasons.
  var write_to_cache = function(module, url, data) {
    var key       = [namespace, module].join('_'),
        url_key   = [key, 'url'].join('_');
        crc32_key = [key, 'crc'].join('_');

    Store[key]        = data;
    Store[url_key]    = url;
    Store[crc32_key]  = crc32( data, salt);

    return true;
  };
  
  // Eval is eval. But we use it only for our code and make sure that it's not manipulated. 
  var eval_module = function(module, code) {
    eval('modules["'+module+'"] = ' + code);
  };
  
  // Search for a function by its name, it can be namespaced as well, e.g.
  // 
  // var my.funky.module = function() { alert('Wicked!')}
  var find_function = function(name) {
    var path = name.split('.'),
        f = window; 
    
    // start with the window and then walkdown the namespaces if any
    for (var i=0; i < path.length; i++) {
      f = f[path[i]];
    };
    
    return f;
  };
  
  // collect all the wicked garbage we left in local Storage
  var my_keys = function(nr) {
    var keys = [];
    for (var i = 0, key; i < Store.length; i++){
      key = Store.key(i);
      if (RegExp('^'+namespace).test(key)) keys.push(key);
    }
    my_keys = function(nr) { return nr ? keys[nr] : keys; };
    return nr ? keys[nr] : keys;
  };
  
  //###Crc32 (c) 2006 Andrea Ercolino, MIT licensed
  
  // I bow down in front of this piece of code. 

  /*
  ===============================================================================
  Crc32 is a JavaScript function for computing the CRC32 of a string
  ...............................................................................

  Version: 1.2 - 2006/11 - http://noteslog.com/category/javascript/

  -------------------------------------------------------------------------------
  Copyright (c) 2006 Andrea Ercolino
  http://www.opensource.org/licenses/mit-license.php
  ===============================================================================
  */
  var crc32 = (function() {
  	var table = "00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D";	

  	/* Number */
  	return function( str, crc ) {
  		if( crc == window.undefined ) crc = 0;
  		var n = 0; //a number between 0 and 255
  		var x = 0; //an hex number

  		crc = crc ^ (-1);
  		for( var i = 0, iTop = str.length; i < iTop; i++ ) {
  			n = ( crc ^ str.charCodeAt( i ) ) & 0xFF;
  			x = "0x" + table.substr( n * 9, 8 );
  			crc = ( crc >>> 8 ) ^ x;
  		}
  		return crc ^ (-1);
  	};
  })();
  
  // Wicked init!
  init();
};