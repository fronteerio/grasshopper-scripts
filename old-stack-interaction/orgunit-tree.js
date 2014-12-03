#!/usr/bin/env node

/**
 * Copyright (c) 2014 "Fronteer LTD"
 * Grasshopper Event Engine
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var _ = require('lodash');
var fs = require('fs');
var parse = require('csv-parse');
var yargs = require('yargs');

var argv = yargs
    .usage('Convert a timetable-django CSV export into a an organiational unit tree.\nUsage: $0')
    .example('$0 --input events.csv --output tree.json', 'Convert events.csv into tree.json')
    .demand('i')
    .alias('i', 'input')
    .describe('i', 'The path where the CSV file can be read')
    .demand('o')
    .alias('o', 'output')
    .describe('o', 'The path where the JSON file should be written to')
    .argv;

var output = [];

// Create the parser
var parser = parse({
    'columns': ['TriposId', 'TriposName', 'PartId', 'PartName', 'SubPartId', 'SubPartName', 'ModuleId', 'ModuleName', 'SerieId', 'SerieName', 'EventId', 'EventTitle', 'EventType', 'EventStartDateTime', 'EventEndDateTime']
});

// Use the writable stream api
parser.on('readable', function(){
    while (record = parser.read()) {
        output.push(record);
    }
});

// Catch any error
parser.on('error', function(err){
    console.log(err.message);
});

// When we are done, test that the parsed output matched what expected
parser.on('finish', function(){
    var tree = generateTree(output);
    printTree(tree);
    writeTree(tree);
});

var inputStream = fs.createReadStream(argv.input);
inputStream.pipe(parser);

/**
 * Given an array of courses, modules, parts, subjects and events,
 * generate an organizational unit tree
 */
var generateTree = function(output) {
    var tree = {
        'name': 'Timetable',
        'type': 'root',
        'nodes': {}
    };

    var prevCourse = null;
    var prevSubject = null;
    var prevPart = null;
    var partCounter = 0;

    output.forEach(function(item) {
        tree.nodes[item.TriposId] = tree.nodes[item.TriposId] || {
            'id': item.TriposId,
            'name': item.TriposName,
            'type': 'course',
            'nodes': {}
        };

        var node = tree.nodes[item.TriposId];

        // A subpart maps to a subject, but is not always present
        if (item.SubPartId && item.SubPartName) {
            tree.nodes[item.TriposId].nodes[item.SubPartId] = tree.nodes[item.TriposId].nodes[item.SubPartId] || {
                'id': item.SubPartId,
                'name': item.SubPartName,
                'type': 'subject',
                'nodes': {}
            };
            node = tree.nodes[item.TriposId].nodes[item.SubPartId];
        }

        /*
         * The next bit is somewhat tricky. In the old stack the tree looks like this:
         * Course
         *    Part
         *       Subject
         *          Module
         * 
         * We'd like our tree to be formatted like this:
         * Course
         *     Subject
         *        Part
         *           Module
         *
         * This means that we cannot simply use PartId as the identifier of our part
         * or we would be re-using it for all our subjects.
         */
        var part = _.find(_.values(node.nodes), {'name': item.PartName});
        var partId = null;
        if (!part) {
            partCounter++;
            partId = item.PartId + '-' + partCounter;
            node.nodes[partId] = {
                'id': partId,
                'name': item.PartName,
                'type': 'part',
                'nodes': {}
            };
        } else {
            partId = part.id;
        }

        // Module
        node.nodes[partId].nodes[item.ModuleId] = node.nodes[partId].nodes[item.ModuleId] || {
            'id': item.ModuleId,
            'name': item.ModuleName,
            'type': 'module',
            'nodes': {}
        };

        // Serie
        node.nodes[partId].nodes[item.ModuleId].nodes[item.SerieId] = node.nodes[partId].nodes[item.ModuleId].nodes[item.SerieId] || {
            'id': item.SerieId,
            'name': item.SerieName,
            'type': 'serie',
            'nodes': {}
        };

        // Event
        node.nodes[partId].nodes[item.ModuleId].nodes[item.SerieId].nodes[item.EventId] = node.nodes[partId].nodes[item.ModuleId].nodes[item.SerieId].nodes[item.EventId] || {
            'id': item.EventId,
            'name': item.EventTitle,
            'type': 'event',
            'event-type': item.EventType,
            'start': item.EventStartDateTime,
            'end': item.EventEndDateTime
        };

        prevCourse = item.TriposId;
        prevSubject = item.SubPartId;
        prevPart = partId;
    });

    return tree;
};

/*
 * Write a tree to a file
 */
var writeTree = function(tree) {
    fs.writeFile(argv.output, JSON.stringify(tree, null, 4), function(err) {
        if (err) {
            console.log('Could not save tree');
        }
    });
};

/*
 * Print the tree to the console
 */
var printTree = function(tree) {
    printNode(tree);
};

/*
 * Print a node (and all its child nodes) to stdout
 */
var printNode = function(node, level) {
    level = level || 0;

    var spaces = '';
    for (var i = 0; i < level * 3; i++) {
        spaces += ' ';
    }

    console.log('%s%s (%s)', spaces, node.name, node.type[0]);
    _.each(node.nodes, function(node, nodeId) {
        printNode(node, level + 1);
    });
};
