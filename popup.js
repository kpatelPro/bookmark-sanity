$(function() {
    $('#search').change(function(){
        dumpBookmarks();
    });
});

function dumpBookmarks() {
    let query = $('#search').val().toLowerCase();
    console.log('dumpBookmarks(' + query + ')');
    $('#bookmarks').empty();
    let bookmarkTreeNodes = chrome.bookmarks.getTree(
        function(bookmarkTreeNodes) {
            $('#bookmarks').append(dumpTreeNodes(bookmarkTreeNodes, query));
        });
}

function dumpTreeNodes(bookmarkNodes, query) {
    let list = $('<ul>');
    let i;
    for (i = 0; i < bookmarkNodes.length; i++) {
        list.append(dumpNode(bookmarkNodes[i], query));
    }
    return list;
}

function dumpNode(bookmarkNode, query) {
    // dump this node
    let span = $('<span>');
    if (bookmarkNode.title) {
        // if not folder && is query
        if (query && !bookmarkNode.children) {
            // if doesn't match, return empty span
            if (String(bookmarkNode.title).toLowerCase().indexOf(query) == -1) {
                return $('<span></span>');
            }
        }

        // create a clickable link
        let anchor = $('<a>');
        anchor.attr('href', bookmarkNode.url);
        //anchor.text(bookmarkNode.title);
        anchor.text(bookmarkNode.title + ' (id:'+bookmarkNode.id+')');
        anchor.click(function() {
            if (bookmarkNode.url) {
                chrome.tabs.create({url: bookmarkNode.url});
            }
        });

        let options = bookmarkNode.children ?
            $('</span><span>[<a href="#" id="flatten">Flatten</a>|<a href="#" id="prune">Prune</a>]</span>|<a href="#" id="split">Split</a>]</span>') :
            $('<span></span>');
        
        span.hover(function() {
            span.append(options);
            $('#flatten').click(function() {
                if (readyOptions("flatten")) {
                    flattenNode(bookmarkNode).then(dumpBookmarks);
                }
            });
            $('#prune').click(function() {
                if (readyOptions("prune")) {
                    let promises = [];
                    pruneEmptyFolders(bookmarkNode, promises);
                    Promise.all(promises).then(dumpBookmarks);
                }
            });
            $('#split').click(function() {
                if (readyOptions("split")) {
                    let splitBy = $("input[name='splitBy']:checked").val();
                    let splitMax = $('#splitMax').val();
                    splitNode(bookmarkNode, splitBy, splitMax)
                    .then(dumpBookmarks);
                }
            });
            options.fadeIn();
        },
        // unhover
        function() {
            options.remove();
        });

        span.append(anchor);
    }

    // dump children
    let li = $(bookmarkNode.title ? '<li>' : '<div>').append(span);
    if (bookmarkNode.children && bookmarkNode.children.length > 0) {
        li.append(dumpTreeNodes(bookmarkNode.children, query));
    }
    return li;
}

function readyOptions(optionsCategory) {
    // fetch options div
    let options = $("#" + optionsCategory + "Options");
    // for now, no options is red light
    if (!options) {
        return false;
    }
    // if options were not visible, show them now
    if (options.css("display") == "none") {
        // hide other options blocks
        $("#options").children("div").each(function(i) {
            $(this).css("display", "none");
        });
        
        // show this one
        options.css("display", "block");
        return false;
    }
    // options are ready
    return true;
}

function flattenNode(bookmarkNode) {
    console.log('flattenNode()');
    let movePromises = [];
    moveBookmarks(bookmarkNode, bookmarkNode, movePromises);
    return Promise.all(movePromises).then(() => {
        return new Promise((resolve) => {
            // refetch bookmarkNode and prune it
            chrome.bookmarks.getSubTree(
                bookmarkNode.id,
                function(bookmarkTreeNodes) {
                    let prunePromises = [];
                    bookmarkTreeNodes.map((node) => { pruneEmptyFolders(node, prunePromises); });
                    Promise.all(prunePromises).then(resolve);
                });
            })});
}

function moveBookmarks(bookmarkNode, destinationNode, promises) {

    if (bookmarkNode.children && bookmarkNode.children.length > 0) {
        //console.log('flattening: ' + bookmarkNode.title);
        let i;
        for (i = 0; i < bookmarkNode.children.length; i++) {
            moveBookmarks(bookmarkNode.children[i], destinationNode, promises);
        }
    } else if (bookmarkNode.url) {
        //console.log(destinationNode.title + ' <- ' + bookmarkNode.title);
        promises.push(moveBookmarkPromise(bookmarkNode.id, destinationNode.id));
    }
}

function pruneEmptyFolders(bookmarkNode, promises) {
    console.log('pruneEmptyFolders: ' + bookmarkNode.title + ' ' + bookmarkNode.id);
    let hasBookmarkChildren = nodeIsBookmark(bookmarkNode);
    if (bookmarkNode.children) {
        let c = 0;
        for (c=0; c < bookmarkNode.children.length; ++c) {
            let child = bookmarkNode.children[c];
            if (nodeIsBookmark(child)) {
                hasBookmarkChildren = true;
            } else if (nodeIsFolder(child)) {
                hasBookmarkChildren |= pruneEmptyFolders(child, promises);
            }
        }
        if (!hasBookmarkChildren) {
            // remove the entire node
            promises.push(removeTreePromise(bookmarkNode.id));
        }
    }
    return hasBookmarkChildren;
}

function nodeIsFolder(bookmarkNode) {
    if (bookmarkNode.children) {
        return true;
    }
    return false;
}

function nodeIsBookmark(bookmarkNode) {
    if (bookmarkNode.url) {
        return true;
    }
    return false;
}

function moveBookmarkPromise(id, destinationId) {
    console.log('moving: ' + id + ' + -> ' + destinationId);
    return new Promise((resolve) => {
        chrome.bookmarks.move(id, {parentId:destinationId},
            (result) => { console.log('moved: ' + id); resolve(result) });
    });
}

function removeBookmarkPromise(id) {
    console.log('removing: ' + id);
    return new Promise((resolve) => {
        chrome.bookmarks.remove(id,
            (result) => { console.log('removed: ' + id); resolve(result) });
    });
}

function removeTreePromise(id) {
    console.log('removing: ' + id);
    return new Promise((resolve) => {
        chrome.bookmarks.removeTree(id,
            (result) => { console.log('removed: ' + id); resolve(result) });
    });
}

function createFolderPromise(params) {
    console.log('creating folder: ' + params.title);
    return new Promise((resolve) => {
        chrome.bookmarks.create(params,
            (newFolder) => { 
                console.log('created: ' + newFolder.title + ' ' + newFolder.id); 
                resolve(newFolder) 
            });
    });
}

function splitNode(bookmarkNode, splitBy, folderBookmarkMax) {
    console.log('splitNode()');

    // error checking
    folderBookmarkMax = parseInt(folderBookmarkMax);
    if (!(folderBookmarkMax > 0)) {
        alert("Split Max must be more than 0.");
        return;
    }

    let promises = [];
    if (bookmarkNode.children && bookmarkNode.children.length > 0) {

        // count the children
        let c;
        let childCount = 0;
        for (c=0; c<bookmarkNode.children.length; ++c)
        {
            let child = bookmarkNode.children[c];
            if (child.url) {
                childCount++;
            }
        }
        //console.log('childCount: ' + childCount);

        // sort the children

        // create lists to compute folder contents
        let folders = {};

        if (splitBy == "count")
        {
            let folderCount = Math.ceil(childCount / folderBookmarkMax);
            let f=0;
            for (f=0; f<folderCount; ++f) {
                folders[splitFolderName(f)] = [];
            }
            //console.log('folderCount: ' + folderCount);

            // compute folder contents
            let fc=0;
            for (c=0, f=0; c<bookmarkNode.children.length; ++c)
            {
                let child = bookmarkNode.children[c];
                if (child.url) {
                    if (fc >= folderBookmarkMax) {
                        f++;
                        fc = 0;
                    }
                    folders[splitFolderName(f)].push(child);
                    fc++;
                }
            }
        }

        // create folders and populate them
        //console.log(folders);
        for (let folderName in folders) {
            let folderContents = folders[folderName];

            // create new folder
            promises.push(
                createFolderPromise(
                {   
                    'parentId': bookmarkNode.id,
                    'title' : folderName    
                }).then((function(folder) { 
                        // populate new folder
                        return function(newFolder) 
                        {
                            console.log('created ' + newFolder.title + ' callback');
                            console.log('populate with: ' + folder.map((node)=>{return node.id}));
                            let fc;
                            let movePromises = [];
                            for (fc=0; fc<folder.length; ++fc)
                            {
                                console.log(folder[fc].id + ' -> ' + newFolder.id);
                                movePromises.push(moveBookmarkPromise(folder[fc].id, newFolder.id));
                            }
                            console.log('waiting to populate' + newFolder.title);
                            return Promise.all(movePromises);
                            //console.log('done populating' + newFolder.title);
                        }
                    })(folderContents))
            );
        }
    }
    return Promise.all(promises);
}

function splitFolderName(f) {
    return '__' + String(f).padStart(2, '0') + '__';
}

document.addEventListener('DOMContentLoaded', function() {
    dumpBookmarks();
});