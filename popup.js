$(function() {
    $('#search').change(function(){
        $('#bookmarks').empty();
        dumpBookmarks($('#search').val().toLowerCase());
    });
});

function dumpBookmarks(query) {
    console.log('dumpBookmarks(' + query + ')');
    var bookmarkTreeNodes = chrome.bookmarks.getTree(
        function(bookmarkTreeNodes) {
            $('#bookmarks').append(dumpTreeNodes(bookmarkTreeNodes, query));
        });
}

function dumpTreeNodes(bookmarkNodes, query) {
    var list = $('<ul>');
    var i;
    for (i = 0; i < bookmarkNodes.length; i++) {
        list.append(dumpNode(bookmarkNodes[i], query));
    }
    return list;
}

function dumpNode(bookmarkNode, query) {

    // dump this node
    if (bookmarkNode.title) {
        // if not folder && is query
        if (query && !bookmarkNode.children) {
            // if doesn't match, return empty span
            if (String(bookmarkNode.title).toLowerCase().indexOf(query) == -1) {
                return $('<span></span>');
            }
        }

        // create a clickable link
        var anchor = $('<a>');
        anchor.attr('href', bookmarkNode.url);
        //anchor.text(bookmarkNode.title);
        anchor.text(bookmarkNode.title + ' (id:'+bookmarkNode.id+')');
        anchor.click(function() {
            if (bookmarkNode.url) {
                chrome.tabs.create({url: bookmarkNode.url});
            }
        });

        var span = $('<span>');
        var options = bookmarkNode.children ?
            $('</span><span>[<a href="#" id="flatten">Flatten</a>|<a href="#" id="prune">Prune</a>]</span>|<a href="#" id="split">Split</a>]</span>') :
            $('<span></span>');
        
        span.hover(function() {
            span.append(options);
            $('#flatten').click(function() {
                flattenNode(bookmarkNode);
            });
            $('#prune').click(function() {
                pruneEmptyFolders(bookmarkNode);
            });
            $('#split').click(function() {
                splitNode(bookmarkNode);
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
    var li = $(bookmarkNode.title ? '<li>' : '<div>').append(span);
    if (bookmarkNode.children && bookmarkNode.children.length > 0) {
        li.append(dumpTreeNodes(bookmarkNode.children, query));
    }
    return li;
}

function flattenNode(bookmarkNode) {
    console.log('flattenNode()');
    moveBookmarks(bookmarkNode, bookmarkNode);
}

function moveBookmarks(bookmarkNode, destinationNode) {

    if (bookmarkNode.children && bookmarkNode.children.length > 0) {
        //console.log('flattening: ' + bookmarkNode.title);
        var i;
        for (i = 0; i < bookmarkNode.children.length; i++) {
            moveBookmarks(bookmarkNode.children[i], destinationNode);
        }
    } else if (bookmarkNode.url) {
        //console.log(destinationNode.title + ' <- ' + bookmarkNode.title);
        chrome.bookmarks.move(bookmarkNode.id, {parentId:destinationNode.id});        
    }
}

function pruneEmptyFolders(bookmarkNode) {
    console.log('pruneEmptyFolders()');
    if (bookmarkNode.children) {
        var c = 0;
        for (c=0; c < bookmarkNode.children.length; ++c) {
            var child = bookmarkNode.children[c];
            console.log('pef: ' + child.id + ', ' + child.url);
            if (!child.url || 0 === child.url.length) {
                if (!child.children || child.children.length == 0) {
                    chrome.bookmarks.remove(child.id);
                }
            }
        }
    }
}

function splitNode(bookmarkNode) {
    // TODO
    console.log('splitNode()');
    if (bookmarkNode.children && bookmarkNode.children.length > 0) {

        // config
        let folderChildCount = 14;

        // count the children
        let c;
        let childCount = 0;
        for (c=0; c<bookmarkNode.children.length; ++c)
        {
            var child = bookmarkNode.children[c];
            if (child.url) {
                childCount++;
            }
        }

        // sort the children

        // create lists to compute folder contents
        let folders = {};
        let folderCount = Math.ceil(childCount / folderChildCount);
        let f=0;
        for (f=0; f<folderCount; ++f) {
            folders[splitFolderName(f)] = [];
        }

        // computer folder contents
        var fc=0;
        for (c=0, f=0; c<childCount; ++c)
        {
            var child = bookmarkNode.children[c];
            if (child.url) {
                if (fc >= folderChildCount) {
                    f++;
                    fc = 0;
                }
                folders[splitFolderName(f)].push(child);
                fc++;
            }
        }

        // create folders and populate them
        //console.log(folders);
        for (f=0; f<folderCount; ++f) {
            // create new folder
            chrome.bookmarks.create(
                {   
                    'parentId': bookmarkNode.id,
                    'title' : splitFolderName(f)     
                },
                (function(folder) { 
                    // populate new folder
                    return function(newFolder) 
                    {
                        //console.log(folder);
                        var fc;
                        for (fc=0; fc<folder.length; ++fc)
                        {
                            //console.log(folder[fc].id + ' -> ' + newFolder.id);
                            chrome.bookmarks.move(folder[fc].id, {parentId:newFolder.id});
                        }
                    }
                })(folders[splitFolderName(f)])
            );
        }
    }
}

function splitFolderName(f) {
    return '__' + String(f).padStart(2, '0') + '__';
}

document.addEventListener('DOMContentLoaded', function() {
    dumpBookmarks();
});