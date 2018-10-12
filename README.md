# Assetic to WebPack Encore

Automatically convert your `{% stylesheets %}` and `{% javascripts %}` into 
`asset()` tags to upgrade from assetic to WebPack Encore!

## Usage

At the moment, this is a rather hacky solution. You have to:

0. *Be sure to have a backup of whatever you will try to upgrade! 
***I do not take any responsibility for using this script!** 
It will change stuff, to the better or worse, you will see!*
1. Download/clone this repository
2. Edit the [main](refactor-webpack.js) javascript file: in case your main Namespace 
(usually the name of the folder inside `src`) is not app, change the 
`topNamespace`-variable.
3. Now you can run the file using node: `node (path...)/refactor-webpack.js (path to src dir)`. 
(don't copy it like that, you have to replace the stuff in paranteses, maybe even add the path to node!) 
4. Update files by hand where more than one stylesheets resp. javascripts tag was inside, 
they should have been listed in the console you ran the script from.
5. Modify the Webpack Encore configuration 
(if you did not yet, you will have to follow the steps listed in the [Symfony Docs](https://symfony.com/doc/current/frontend/encore/installation.html)). 
(see also [Result](#Result))

## Result

All tags will be replaced by separate instances of links/script-tags with 
an `asset`-call. There will be `entries.json`-files in the `Resources/public` directory 
of your bundles. You can either process these with some other easy script or 
use the following webpack-config to load entries dynamically from the json-files: 

````javascript

// normal, default webpack encore config defining the `Encore` variable
// add the following before the module.exports = Encore.... line

// here we load our necessary packages
// to load the entries.json files.
// be sure to run `yarn add glop path fs` to fix possible issues occuring when running this file
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
