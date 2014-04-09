module.exports = function(grunt) {
    'use strict';

    require('time-grunt')(grunt);

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            src: [
                'Gruntfile.js',
                'web/**/*.js',
                'bin/**/*.js',
                '!**/*.min.js'
            ]
        },

        watch: {
            options: {
                nospawn: false,
                livereload: true,
                interrupt: true
            },
            js: {
                files: ['<%= jshint.src %>'],
                tasks: ['newer:jshint:src']
            }
        }
    });

    require('load-grunt-tasks')(grunt);

    grunt.registerTask('default', ['jshint']);
};
