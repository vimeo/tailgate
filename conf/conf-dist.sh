#!/bin/bash

# repository link for use in menu
export REPO_LINK="http://github.com/vimeo/tailgate"

# output logging to stdout
export LOGGING="1"

# options: tail|native|dev
export TAILER="dev"

# types: ldap|simple|none
export AUTH_TYPE="none"

# simple auth
export SIMPLE_USERNAME="admin"
export SIMPLE_PASSWORD="password"

# ldap config
export LDAP_URL="ldaps://ldap.domain.name"
export LDAP_SEARCH_BASE="dc=company,dc=com"
# sprintf format
export LDAP_SEARCH_FILTER="(uid=%s)"
export LDAP_CACHE="true"

# tailgate config
export TAILGATE_HTTP_PORT="8080"
export TAILGATE_HTTPS_PORT="443"
export TAILGATE_DATA_DIR=""

# set ssl files to enable https (does not apply to websocket data, only login/http)
#export SSL_KEY_FILE="/path/to/key/file"
#export SSL_CRT_FILE="/path/to/crt/file"
#export SSL_BUNDLE_FILE="/path/to/bundle/crt/file"

# sprintf format of log filename where %s is the parent dir name
# Example:
#
#   <TAILGATE_DATA_DIR>/app1
#   <TAILGATE_DATA_DIR>/app2
#   <TAILGATE_DATA_DIR>/app3
#
# "%s_error.log" ->
#   <TAILGATE_DATA_DIR>/app1/app1_error.log
#   <TAILGATE_DATA_DIR>/app1/app2_error.log
#   <TAILGATE_DATA_DIR>/app1/app3_error.log
#
export TAILGATE_DATA_LOG="%s.log"

