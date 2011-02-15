## Wicked!

wicked.js is a module manager for Javascript. It loads external JavaScript functions
across domains and caches its code using localStorage for faster future loading.ng.

### Example Usage

    wicked = new Wicked;
    wicked.get("myWickedFunction","http://example.com/my_wicked_function.js", function(myWickedFunction){
      var instance = new myWickedFunction({foo: 'bar'});
      instance.showSomethingWicked();
    })
   
### Parameters

* **namespace** (optional, default: 'wicked')
  namespace is prepended to all localStorage keys used for caching.

* **salt** (optional, default: Math.random())
  crc32 checksums are stored among with the Modules in order to avoid manipulation
  and to allow checks for updates.
   
### Browser Support

All Browsers younger that IE7 are supported. [localStorage](http://dev.w3.org/html5/webstorage/) is required.
   
### Documentation

Find the annotated source in docs/wicked.html

### Credits

the crc32 function used by wicked.js is (c) Andrea Ercolino ([MIT License](http://www.opensource.org/licenses/mit-license.php))  
http://noteslog.com/category/javascript/ 