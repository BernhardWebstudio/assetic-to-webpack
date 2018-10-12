#!/usr/bin/env node

/**
 * Module dependencies.
 */
var glob = require('glob');
const fs = require('fs');
const replace = require('replace-in-file');
const changeCase = require('change-case');
var child_process = require('child_process');
var program = require('commander');
const jsonfile = require('jsonfile');

// global state :/
var workingDir = ".";
var topNamespace = "App";

program.version('0.0.0', '-v, --version');
program.option('-d, --dry', 'Run dry without changing files');
program.arguments('<topNamespace> [path]').action(function (topNamespaceA, path = ".") {
    topNamespace = topNamespaceA ? topNamespaceA : topNamespace;
    workingDir = path;
})
program.parse(process.argv);

// traverse twig files in bundles
var files = glob.sync(workingDir + "/src/**/*.twig", {});
console.log("got " + files.length + " files");

files.forEach(file => {
    //console.log("Handling file " + file);
    handleFileAsset(file, "stylesheets", "link");
    handleFileAsset(file, "javascripts", "script");
});

function handleFileAsset(file, assetTwigTag, assetHTMLTag) {
    var jf = fs.readFileSync(file, 'utf8');

    //# extract "@file" strings -> path
    const tag = findTags(assetTwigTag, jf);
    const endTag = findEndTags(assetTwigTag, jf);
    if (!tag || !endTag) {
        return;
    }

    const paths = findPaths(tag);

    if (paths === null) {
        console.log("Skipping " + assetTwigTag + " in " + file + " as null as paths was found.");
        return;
    }

    //# replace href=/src={{ asset_url }} with href=/src={{ asset(path) }}
    var oldLine = grep("\<" + assetHTMLTag + ".*asset_url", file);

    if (oldLine.some(result => {
        return (result["results"].length > 1);
    })) {
        console.warn("File " + file + " has more than one occurrence of tag " + assetHTMLTag + ". handle manually.");
        return;
    }

    adabtLine(oldLine, paths, file);

    // add paths to public/entries.json
    if (!program.dry) {
        submitPaths(assetTwigTag, paths);
    }

    //# delete {% tags
    replaceInFile(file, tag, "");
    // delete %} tags
    replaceInFile(file, endTag, "");
}

console.log("handled " + files.length + " files");

/**
 * Find tags ({% tagName ... %}) in file
 *
 * @param {string} tagName
 * @param {string} source file to search
 */
function findTags(tagName, source) {
    const tagRegexp = new RegExp("{%\\s*" + tagName + ".*[\\n]*(?:.*\"@([a-z./]*)\"[\\s\\n]*.*)*[\\s\\n]*.*%}", "gi");
    const tags = source.match(tagRegexp);
    // console.log("found tags: ", tags);
    return tags;
}

/**
 * Find End Tags ({% endTagName %}) in file
 *
 * @param {string} tagName
 * @param {string} source
 */
function findEndTags(tagName, source) {
    const tagRegexp = new RegExp("{%\\s*end" + tagName + "[\\s\\n]*.*%}", "gi");
    const tags = source.match(tagRegexp);
    // console.log("found endtags: ", tags);
    return tags;
}

/**
 * Find Paths formatted as \"@Path"\ in a string
 *
 * @param {string} tags
 */
function findPaths(tags) {
    const pathRegexp = /\"(@[a-z./]*)\"/gi;
    const paths = getMatches(tags, pathRegexp, 1);
    // console.log("found paths: ", paths);
    return parsePaths(paths);
}

/**
 * Transform @Path strings to Path objects
 *
 * @param {array<string>} paths
 */
function parsePaths(paths) {
    var new_paths = [];
    paths.forEach(path => {
        var prefix = path.split("/Resources/public/").shift();
        if (prefix == path) {
            // other @, e.g. @jquery – we do not handle these here
            console.log("Skipping as path '" + path + "' will not be handled.");
            return null;
        }
        new_paths.push({
            source: path,
            basename: removeExtension(path.split("/").pop()),
            extension: path.split(".").pop(),
            bundlename: changeCase.paramCase(prefix.replace("/", "-").replace("@", "")),
            bundlepath: prefix.replace("@" + topNamespace, "/src/" + topNamespace + "/"),
            internal: "./" + path.split("Resources/public/").pop()
        });
    });
    return new_paths;
}

/**
 * Remove the extension from a file name path
 *
 * @param {string} path
 */
function removeExtension(path) {
    return path.replace(/\.[^/.]+$/, "");
}

/**
 * Change <link> and <script> from the old asset_url to the "new" asset()
 *
 * @param {array} results the lines to change
 * @param {array} newPaths the paths to adabt
 * @param {string} file the file to write to
 */
function adabtLine(results, newPaths, file) {
    if (!newPaths || !newPaths.length) {
        //console.log("no paths for " + file);
        return;
    }
    if (!results || !results.length) {
        //console.log("no lines to change for " + file);
        return;
    }
    results.forEach(result => {
        if (result["results"].length > 1) {
            console.warn("File " + file + " has more than one occurrence of a tag. handle manually");
        } else {
            var line = result["results"][0]['line'];
            var new_line = "";
            newPaths.forEach(path => {
                ext = path.extension === "js" ? "js" : "css";
                new_href = "{{ asset('build/" + path.bundlename + "-" + path.basename + "." + ext + "') }}"
                new_line += line.replace(/{{\s*asset_url\s*}}/gi, new_href) + "\n";
            });
            const options = {
                files: file,
                from: line,
                to: new_line,
            };
            try {
                if (!program.dry) {
                    let changedFiles = replace.sync(options);
                }
            }
            catch (error) {
                console.error('Error occurred:', error);
            }
        }
    });

    // console.log("Changed one tag for " + file);
}

/**
 * Save paths with names to entries.json file
 *
 * @param {string} type
 * @param {array} paths
 */
function submitPaths(type, paths) {
    switch (type) {
        case "javascripts":
            type = "entry";
            break;
        case "stylesheets":
            type = "styleEntry"
            break;
        default:
            throw new Exception("Expected 'javascripts' or 'stylesheets' as argument 1 in function submitPaths");
    }

    paths.forEach(path => {
        var data = null;
        var jsonFilePath = workingDir + path.bundlepath + "/Resources/public/entries.json";
        try {
            data = jsonfile.readFileSync(jsonFilePath, { flag: 'r+' });
        } catch (e) {
            console.warn("Failed to read " + jsonFilePath, e);
        }
        if (data === null) {
            console.log("data null");
            data = {};
        }
        if (!data[type]) {
            data[type] = {};
            console.log("unknown type: " + type);
        }

        data[type][path.bundlename + "-" + path.basename] = path.internal;

        jsonfile.writeFileSync(jsonFilePath, data, {
            flag: 'w'
        });
    });
}

/**
 * Wrapper function for system grep
 *
 * @param {string} what
 * @param {string} where
 */
function grep(what, where) {
    try {
        var out = child_process.execSync("grep '" + what + "' " + where + " -nrH", { 'encoding': 'utf8' });
    } catch (e) {
        // no resuls
        //console.log(e);
        var out = "\n";
    }
    var list = {};

    //console.log(out);
    var results = out.split('\n');

    // remove last element (it’s an empty line)
    results.pop();

    // setup filename array
    for (var i = 0; i < results.length; i++) {
        var eachPart = results[i].split(':') //file:linenum:line
        list[eachPart[0]] = [];
    }
    // fill filename arrays with results
    for (var i = 0; i < results.length; i++) {
        var eachPart = results[i].split(':'); //file:linenum:line
        var details = {};
        var filename = eachPart[0];
        details['line_number'] = eachPart[1];

        eachPart.shift();
        eachPart.shift();
        details['line'] = eachPart.join(':');

        list[filename].push(details);
    }

    var results = [];
    var files = Object.keys(list);
    for (var i = 0; i < files.length; i++) {
        results.push({ 'file': files[i], 'results': list[files[i]] });
    }

    return results;
}

function getMatches(string, regex, index = 0) {
    index = index || (index = 1); // default to the first capturing group
    var matches = [];
    var match;
    while ((match = regex.exec(string)) != null) {
        matches.push(match[index]);
    }
    return matches;
}

function replaceInFile(file, source, target) {
    const options = {
        files: file,
        from: source,
        to: target,
    };
    try {
        if (!program.dry) {
            let changedFiles = replace.sync(options);
        }
    }
    catch (error) {
        console.error('Error occurred replacing tags: ', error);
    }
}
