# Assetic to WebPack Encore

Automatically convert your `{% stylesheets %}` and `{% javascripts %}` into 
`asset()` tags to upgrade from assetic to WebPack Encore!

## Usage

At the moment, this is a rather hacky solution. You have to:

0. *be sure to have a backup of whatever you will try to upgrade*
1. download/clone this repository
2. edit the main javascript file: in case your main Namespace 
(usually the name of the folder inside `src`) is not app, change the 
`topNamespace`-variable.
3. Now you can run the file using node: `node (path...)/refactor-webpack.js (path to src dir)`. 
(don't copy it like that, you have to replace the stuff in paranteses!) 
4. Update files by hand where more than one stylesheets resp. javascripts tag was insite.
5. Set the Encore configuration. (see [Result](#Result))

## Result

All tags will be replaced by separate instances of links/script-tags with 
an `asset`-call. There will be `entries.json`-files in the `Resources/public` directory 
of your bundles. You can either process these with some other easy script or 
use the following webpack-config to load entries dynamically from the json-files: 

````javascript

// normal, default webpack encore config defining the `Encore` variable
// add the following before the module.exports = Encore.... line

// here we load our necessary packages
// to load the entries.json files
const glob = require("glob");
const fs = require("fs");
const path = require('path');
function resolvePath(entries, filepath) {
    return path.dirname(entries) + filepath.replace(new RegExp("^(\.)"), "");
}
// change App to your top namespace
var files = glob.sync(__dirname + "/src/App/*/Resources/public/entries.json", {});

files.forEach(file => {
    config = JSON.parse(fs.readFileSync(file));
    for (var key in config["entry"]) {
        Encore.addEntry(key, resolvePath(file, config["entry"][key]));
    }
    for (var key in config["styleEntry"]) {
        Encore.addStyleEntry(key, resolvePath(file, config["styleEntry"][key]));
    }
    for (var key in config["sharedEntry"]) {
        Encore.createSharedEntry(key, resolvePath(file, config["sharedEntry"][key]));
    }
});
// finally, export webpack config as in default encore config
module.exports = Encore.getWebpackConfig();

````
