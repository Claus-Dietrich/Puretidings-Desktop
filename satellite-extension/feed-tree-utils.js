/*
 * This file contains utility functions for managing the hierarchical feed tree.
 * It includes functions for converting the old flat feed list to the new tree structure,
 * traversing the tree, and finding nodes.
 */

/**
 * Converts the old flat array of feeds into a hierarchical tree structure.
 *
 * @param {Array} flatFeeds The old flat array of feeds.
 * @returns {Array} The new tree structure.
 */
function convertToTree(flatFeeds) {
  const tree = [];
  const folderMap = new Map(); // Maps folder names to folder nodes in the tree

  // Create top-level folders first
  flatFeeds.forEach(feed => {
    const folderName = feed.folder || 'Uncategorized';
    if (!folderMap.has(folderName)) {
      const folderNode = {
        id: `folder-${crypto.randomUUID()}`,
        name: folderName,
        type: 'folder',
        children: []
      };
      folderMap.set(folderName, folderNode);
      tree.push(folderNode);
    }
  });

  // Add feeds to their respective folders
  flatFeeds.forEach(feed => {
    const folderName = feed.folder || 'Uncategorized';
    const folderNode = folderMap.get(folderName);
    
    const feedNode = {
      id: feed.id,
      name: feed.name,
      type: 'feed',
      url: feed.url
    };
    folderNode.children.push(feedNode);
  });

  return tree;
}

/**
 * Flattens the tree structure back into a simple array of feeds for saving.
 * This is a temporary measure until all parts of the extension use the tree.
 * @param {Array} tree The hierarchical feed tree.
 * @returns {Array} A flat array of feed objects with 'folder' properties.
 */
function flattenTree(tree) {
    const flatFeeds = [];

    function traverse(nodes, currentFolderPath) {
        for (const node of nodes) {
            if (node.type === 'folder') {
                // For nested folders, the path would be 'Parent/Child'
                const newPath = currentFolderPath ? `${currentFolderPath}/${node.name}` : node.name;
                traverse(node.children, newPath);
            } else if (node.type === 'feed') {
                flatFeeds.push({
                    id: node.id,
                    name: node.name,
                    url: node.url,
                    // Assign the folder path. 'Uncategorized' folders from the old system might not have a path.
                    folder: currentFolderPath === 'Uncategorized' ? '' : currentFolderPath
                });
            }
        }
    }

    traverse(tree, '');
    return flatFeeds;
}


/**
 * Finds a node (feed or folder) in the tree by its ID.
 * @param {Array} tree The feed tree.
 * @param {string} nodeId The ID of the node to find.
 * @returns {object | null} The found node or null.
 */
function findNodeById(tree, nodeId) {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.type === 'folder') {
      const found = findNodeById(node.children, nodeId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Finds the parent folder of a node by the node's ID.
 * @param {Array} tree The feed tree.
 * @param {string} nodeId The ID of the child node.
 * @returns {object | null} The parent folder node or null if it's a top-level node.
 */
function findParentFolder(tree, nodeId) {
    for (const node of tree) {
        if (node.type === 'folder') {
            for (const child of node.children) {
                if (child.id === nodeId) {
                    return node; // `node` is the parent
                }
            }
            // Recurse into subfolders
            const parentInSubfolder = findParentFolder(node.children, nodeId);
            if (parentInSubfolder) {
                return parentInSubfolder;
            }
        }
    }
    return null; // No parent found at this level
}
