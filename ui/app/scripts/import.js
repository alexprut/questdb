/*******************************************************************************
 *    ___                  _   ____  ____
 *   / _ \ _   _  ___  ___| |_|  _ \| __ )
 *  | | | | | | |/ _ \/ __| __| | | |  _ \
 *  | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *   \__\_\\__,_|\___||___/\__|____/|____/
 *
 * Copyright (c) 2014-2016 Appsicle
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/*globals $:false */
/*globals jQuery:false */

/**
 * @return {string}
 */
function s4() {
    'use strict';
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

function guid() {
    'use strict';
    return (s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4());
}

function toSize(x) {
    'use strict';
    if (x < 1024) {
        return x;
    }

    if (x < 1024 * 1024) {
        return Math.round(x / 1024) + 'KB';
    }

    if (x < 1024 * 1024 * 1024) {
        return Math.round(x / 1024 / 1024) + 'MB';
    }

    return Math.round(x / 1024 / 1024 / 1024) + 'GB';
}

function nopropagation(e) {
    'use strict';

    e.stopPropagation();
    if (e.preventDefault) {
        e.preventDefault();
    }
}

(function ($) {
    'use strict';

    $.fn.importManager = function () {
        var dict = {};
        var container = this;
        var canvas;
        var top = 0;
        var uploadQueue = [];
        var current = null;
        var rowHeight = 35;
        var xhr = null;

        function updateProgress(event) {
            if (event.lengthComputable) {
                var pos = event.loaded || event.position;
                $('#' + current.id).find(' > .ud-progress').css('width', (pos * 100 / current.size) + '%');
            }
        }

        function updateButtons() {
            var selected = false;
            var retry = false;

            for (var id in dict) {
                if (dict.hasOwnProperty(id)) {
                    var e = dict[id];
                    if (e.selected) {
                        selected = true;
                        if (e.retry) {
                            retry = true;
                            break;
                        }
                    }
                }
            }
            $('#btnImportClearSelected').attr('disabled', !selected);
            $('#btnRetry').attr('disabled', !retry);
        }

        function renderRowAsOverwrite(x, e) {
            e.retry = 2; // overwrite
            $('#' + e.id + ' > .ud-c1').html(e.name + '<span class="label label-danger m-l-lg">overwrite</span>');
            updateButtons();
        }

        function renderRowAsAppend(x, e) {
            e.retry = 1; // append
            $('#' + e.id + ' > .ud-c1').html(e.name + '<span class="label label-primary m-l-lg">append</span>');
            updateButtons();
        }

        function renderRowAsCancel(x, e) {
            e.retry = 0; // cancel
            $('#' + e.id + ' > .ud-c1').html(e.name);
            updateButtons();
        }

        function setupUploadProgressCallback() {
            var xhrobj = $.ajaxSettings.xhr();
            if (xhrobj.upload) {
                xhrobj.upload.addEventListener('progress', updateProgress, false);
            }
            return xhrobj;
        }

        var importRequest = {
            xhr: setupUploadProgressCallback,
            url: '/imp?fmt=json',
            type: 'POST',
            contentType: false,
            processData: false,
            cache: false
        };

        var existenceCheckRequest = {
            type: 'GET',
            contentType: false,
            processData: false,
            cache: false
        };

        function updateBtnImportCancel() {
            $('#btnImportCancel').attr('disabled', current === null);
        }

        function toggleRow() {
            var id = $(this).parent().attr('id');
            var btn = $('#' + id).find('.fa');
            var e = dict[id];

            e.selected = !e.selected;

            if (e.selected) {
                btn.removeClass('fa-square-o').addClass('fa-check-square-o');
            } else {
                btn.removeClass('fa-check-square-o').addClass('fa-square-o');
            }

            updateButtons();
        }

        function showDetail(e) {
            var item = dict[$(this).parent().attr('id')];
            if (item.importState > -1) {
                $(document).trigger('import.detail', item);
            }
            nopropagation(e);
        }

        function render(e) {
            canvas.append('<div id="' + e.id + '" class="ud-row" style="top: ' + top + 'px;"><div class="ud-cell ud-c0"><i class="fa fa-square-o ud-checkbox"></i></div><div class="ud-cell ud-c1">' + e.name + '</div><div class="ud-cell ud-c2">' + e.sizeFmt + '</div><div class="ud-cell ud-c3"><span class="label">pending</span></div></div>');
            var row = $('#' + e.id);
            row.find('.ud-c0').click(toggleRow);
            row.find('.ud-c1').click(showDetail);
            row.find('.ud-c2').click(showDetail);
            row.find('.ud-c3').click(showDetail);
            top += rowHeight;
        }

        function status(e, html, processNext) {
            var row = $('#' + e.id);
            row.find(' > .ud-c3').html(html);
            row.find(' > .ud-progress').remove();

            if (processNext) {
                var next = uploadQueue.shift();
                if (next) {
                    processFile(next);
                } else {
                    current = null;
                    xhr = null;
                }
            }
            updateBtnImportCancel();
            $(document).trigger('import.detail.updated', e);
        }

        function importDone(data) {
            if (data.status === 'OK') {
                current.response = data;
                current.importState = 0; // ok
                renderRowAsCancel(null, current);
                status(current, '<span class="label label-success">imported</span>', true);
            } else {
                current.importState = 4; // error with journal, status has error message
                current.response = data.status;
                status(current, '<span class="label label-danger">failed</span>', true);
            }
        }

        function httpStatusToImportState(s) {
            switch (s) {
                case 0:
                    return 3; // server not responding
                case 500:
                    return 5; // internal error
                default:
                    return 101; // unknown
            }
        }

        function importFailed(r) {
            renderRowAsCancel(null, current);
            if (r.statusText !== 'abort') {
                current.response = r.responseText;
                current.importState = httpStatusToImportState(r.status);
                status(current, '<span class="label label-danger">failed</span>', true);
            } else {
                // current.importState = -1; // abort
                status(current, '<span class="label label-warning">aborted</span>', true);
            }
        }

        function setupImportRequest() {
            importRequest.url = '/imp?fmt=json';
            if (current.retry === 2) {
                importRequest.url += '&o=true';
            }
            importRequest.xhr = setupUploadProgressCallback;
            importRequest.data = new FormData();

            // encode type overrides
            if (current.response && current.response.columns) {
                var schema = '';
                for (var i = 0; i < current.response.columns.length; i++) {
                    var c = current.response.columns[i];
                    if (c.altType && c.type !== c.altType) {
                        schema += c.name + '=' + c.altType + '&';
                    } else if (c.errors === 0) {
                        schema += c.name + '=' + c.type + '&';
                    }
                }
                importRequest.data.append('schema', schema);
            }

            importRequest.data.append('data', current.file);
            return importRequest;
        }

        function importFile() {
            status(current, '<span class="label label-info">importing</span>', false);
            $('#' + current.id).append('<div class="ud-progress"></div>');
            xhr = $.ajax(setupImportRequest()).done(importDone).fail(importFailed);
            updateBtnImportCancel();
        }

        function existenceCheckFork(e) {
            switch (e.status) {
                case 'EXISTS':
                    current.importState = 1; // exists
                    status(current, '<span class="label label-danger">exists</span>', true);
                    break;
                case 'DOES_NOT_EXIST':
                    current.importState = 0; // ok
                    importFile();
                    break;
                case 'EXISTS_FOREIGN':
                    current.importState = 2; // exists foreign (reserved)
                    status(current, '<span class="label label-danger">reserved</span>', true);
                    break;
                default:
                    current.importState = 101; // unknown
                    status(current, '<span class="label label-danger">failed</span>', true);
                    break;
            }
        }

        function processFile(e) {
            current = e;
            if (e.retry) {
                current.importState = 0;
                importFile();
            } else {
                existenceCheckRequest.url = '/chk?f=json&j=' + e.name;
                $.ajax(existenceCheckRequest).then(existenceCheckFork).fail(importFailed);
            }
        }

        function addFile(x, dataTransfer) {
            for (var i = 0; i < dataTransfer.files.length; i++) {
                var f = dataTransfer.files[i];
                var e = {
                    id: guid(),
                    name: f.name,
                    size: f.size,
                    file: f,
                    sizeFmt: toSize(f.size),
                    selected: false,
                    imported: false
                };
                dict[e.id] = e;
                render(e);
                if (current != null) {
                    uploadQueue.push(e);
                } else {
                    processFile(e);
                }
            }
        }

        function clearSelected() {
            for (var id in dict) {
                if (dict.hasOwnProperty(id)) {
                    var e = dict[id];
                    if (e.selected && e !== current) {
                        var uploadQueueIndex = uploadQueue.indexOf(e);
                        if (uploadQueueIndex > -1) {
                            delete uploadQueue[uploadQueueIndex];
                        }
                        $('#' + id).remove();
                        delete dict[id];
                        $(document).trigger('import.cleared', e);
                    }
                }
            }

            // rejig remaining rows
            top = 0;
            var rows = canvas.find('.ud-row');
            for (var i = 0; i < rows.length; i++) {
                $(rows[i]).css('top', top);
                top += rowHeight;
            }
            updateButtons();
        }

        function retrySelected() {
            for (var id in dict) {
                if (dict.hasOwnProperty(id)) {
                    var e = dict[id];
                    if (e.selected && e.retry) {
                        if (current === null) {
                            processFile(e);
                        } else {
                            uploadQueue.push(e);
                        }
                    }
                }
            }
        }

        function abortImport() {
            if (xhr !== null) {
                xhr.abort();
            }
        }

        function subscribe() {
            // subscribe to document event
            $(document).on('dropbox.files', addFile);
            $(document).on('import.clearSelected', clearSelected);
            $(document).on('import.cancel', abortImport);
            $(document).on('import.retry', retrySelected);

            $(document).on('import.line.overwrite', renderRowAsOverwrite);
            $(document).on('import.line.append', renderRowAsAppend);
            $(document).on('import.line.abort', renderRowAsCancel);
        }

        function init() {
            container.append('<div class="ud-header-row"><div class="ud-header ud-h0">&nbsp;</div><div class="ud-header ud-h1">File name</div><div class="ud-header ud-h2">Size</div><div class="ud-header ud-h3">Status</div></div>');
            container.append('<div class="ud-canvas"></div>');
            canvas = container.find('> .ud-canvas');
            subscribe();
        }

        init();

        return this;
    };

    // this class will manage drag&drop into dropbox element and
    // broadcast file readiness to document via custom event 'dropbox.files'
    $.fn.dropbox = function () {

        var collection = $();
        var target = this;

        function startDrag() {
            target.addClass('drag-drop').removeClass('drag-idle');
        }

        function endDrag() {
            target.removeClass('drag-drop').addClass('drag-idle');
        }

        function init() {
            target.on('drop', function (evt) {
                endDrag();
                collection = $();
                $(document).trigger('dropbox.files', evt.originalEvent.dataTransfer);
            });

            // deal with event propagation to child elements
            // http://stackoverflow.com/questions/10867506/dragleave-of-parent-element-fires-when-dragging-over-children-elements

            target.each(function () {

                var self = $(this);

                self.on('dragenter', function (event) {
                    if (collection.size() === 0) {
                        nopropagation(event);
                        startDrag();
                    }
                    collection = collection.add(event.target);
                });

                self.on('dragleave', function (event) {
                    /*
                     * Firefox 3.6 fires the dragleave event on the previous element
                     * before firing dragenter on the next one so we introduce a delay
                     */
                    setTimeout(function () {
                        collection = collection.not(event.target);
                        if (collection.size() === 0) {
                            endDrag();
                        }
                    }, 1);
                });
            });

        }

        init();

        return this;
    };
}(jQuery));

$(document).ready(function () {
    'use strict';

    $('#btnImportClearSelected').click(function () {
        $(document).trigger('import.clearSelected');
    });

    $('#btnImportCancel').click(function () {
        $(document).trigger('import.cancel');
    });

    $('#btnRetry').click(function () {
        $(document).trigger('import.retry');
    });

    $('#dragTarget').dropbox();
    $('#import-file-list').importManager();

    //
    // prevent dropping files into rest of document
    //
    $(document).on('dragenter', nopropagation);
    $(document).on('dragover', nopropagation);
    $(document).on('drop', nopropagation);

    $(document).ready(function () {
        $('input').iCheck({
            checkboxClass: 'icheckbox_square-red',
            radioClass: 'iradio_square-red'
        });
    });
});