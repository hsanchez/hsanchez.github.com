$(function() {
    var VERSION = "1";
    if(window.localStorage.ss_version !== VERSION) {
        delete window.localStorage.answers;
        delete window.localStorage.ss_page;
        delete window.localStorage.candidates;
        window.localStorage.ss_version = VERSION;
    }

    //https://github.com/coolaj86/knuth-shuffle
    //OR http://en.wikipedia.org/wiki/Fisher-Yates_shuffle
    function shuffle(array) {
        var currentIndex = array.length
            , temporaryValue
            , randomIndex
            ;

        // While there remain elements to shuffle...
        while (0 !== currentIndex) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }

        return array;
    }

    function parseArray(array) {
        if(!array) {
            return [];
        }

        return JSON.parse(array);
    }

    if(!String.prototype.trim) {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g,'');
        };
    }

    // Setup the main controller
    var _ = {
        page: window.localStorage.ss_page || 1,
        item: 0,
        answers:  parseArray(window.localStorage.answers),
        candidates: [],
        api: 'http://api.stackexchange.com/2.1/',
        stop: false,
        reset: function() {
            _.item = 0;
            $('#output').val('');
            $('#logger').empty().append($('<div>', {class: 'oc', text: 'output console'}));
            $('#displayer').empty().append($('<div>', {class: 'oc', text: 'candidate console'}));
            $('#sort').attr('disabled', false).text('START');
            $('.done').hide();
        },

        logger: function(text, class_suffix, to_append) {
            var $div = $('<div>', {
                'html': text,
                'class': 'log-' + class_suffix
            });

            $('#logger').append($div);

            if(to_append) {
                $div.append(to_append);
            }

            $('#logger')[0].scrollTop = $('#logger')[0].scrollHeight;
        },

        displayer: function(text, class_suffix, to_append) {
            var $div = $('<div>', {
                'html': text,
                'class': 'disp-' + class_suffix
            });

            $('#displayer').append($div);

            if(to_append) {
                $div.append(to_append);
            }

            $('#displayer')[0].scrollTop = $('#displayer')[0].scrollHeight;
        },

        was_listed: function(message){
            if(message) {
                _.displayer(message, "item");
            }
        },

        was_error: function(reason) {
            if(reason) {
                _.logger(reason, "error");
            }

            _.item++;
            _.run_snippet();
        },

        get_next_answer: function(message){
            if(message) {
                _.logger(message, "success");
            }

            _.item++;
            _.run_snippet();
        },

        chooseCandidates: function(lengthAsBound){
            _.logger("Found enough suitable code snippets", "success");

            _.displayer("Fetching candidates", "trying");
            _.displayer("Candidates downloading, ready to try.", "info");

            // Output!
            setTimeout(function() {

                var len = lengthAsBound ? _.candidates.length : 5;

                var shuffledArray = shuffle(_.candidates);
                for(var idx = 0; idx < len; idx++){
                    var answerObject    = shuffledArray[idx];
                    var answer_id       = answerObject.answer_id;
                    var link            = answerObject.link;

                    _.displayer("Try StackOverflow answer ", "trying", $('<a>', {'text': answer_id, 'href': link, 'target': '_blank'}));
                    _.was_listed("Source code curation candidate");
                }



                $('#sort').attr('disabled', false).text('Search Again');
                _.wait(false);
                _.item++;
                setTimeout(function() {
                    $('.done').fadeIn();
                }, 400);

                _.candidates = []; // clear array

            }, 230); // Don't freeze up the browser
        },

        get_next_page: function() {
            if(parseInt(_.page) >= 7) {
                _.logger("Out of answers from StackOverflow!", "out");
                $('#sort').attr('disabled', false).text('Start Again');
                _.wait(false);
                return false;
            }

            _.logger("Fetching page " + _.page + "...", "trying");

            var common_url = '&pagesize=100&order=desc&site=stackoverflow&todate=1363060800';
            var question_url = _.api + 'questions?sort=activity&tagged=sort;java&page=' + _.page + common_url;

            $.getJSON(question_url, function(data_questions) {
                var answer_ids = [];
                $.each(data_questions['items'], function(k, v) {
                    if(v.accepted_answer_id) {
                        answer_ids.push(v.accepted_answer_id);
                    }
                });

                var answer_url = _.api + 'answers/' + answer_ids.join(';') + '?sort=activity&filter=!9hnGsyXaB' + common_url;

                $.getJSON(answer_url, function(data_answers) {
                    _.logger("Answers downloading, ready to check.", "success");
                    $.each(data_answers['items'], function(k, v){
                        _.answers.push({
                            'answer_id': v.answer_id,
                            'question_id': v.question_id,
                            'link': 'http://stackoverflow.com/questions/'+v.question_id+'/#' + v.answer_id,
                            'body': v.body
                        });
                    });

                    // Save the new answers
                    window.localStorage.answers = JSON.stringify(_.answers);

                    _.page = parseInt(_.page, 10) + 1;
                    window.localStorage.ss_page = _.page;

                    _.run_snippet();
                });
            });
        },

        run_snippet: function() {
            if(_.stop) {
                _.logger("Stopped by user", "out");
                $('#sort').attr('disabled', false).text('Sort Again');
                _.wait(false);
                _.stop = false;
                _.reset();
                return false;
            }

            _.stop = false;

            if(_.item >= _.answers.length) {
                _.get_next_page();
                return false;
            }

            $('.done').hide();

            _.wait(true);

            // Output!
            setTimeout(function() {
                var answer_id = _.answers[_.item].answer_id;
                var link = _.answers[_.item].link;

                _.logger("Checking StackOverflow answer ", "trying", $('<a>', {'text': answer_id, 'href': link, 'target': '_blank'}));
                _.run_snippet_go();

            }, 230); // Don't freeze up the browser
        },

        run_snippet_go: function() {
            var answer = _.answers[_.item].body;
            var answer_id = _.answers[_.item].answer_id;
            var question_id = _.answers[_.item].question_id;
            var link = _.answers[_.item].link;
            var codes = answer.match(/<code>(.|[\n\r])*?<\/code>/g);

            if(!codes) {
                _.was_error("Could not find a code snippet");
                return false;
            }

            var max;
            var maxCount = 0;
            for(var idx = 0; idx < codes.length; idx++){
                var codeSnippet = codes[idx];
                var loc         = codeSnippet.split('\n');
                if(typeof max == 'undefined'){
                    if(loc.length >= 10){
                        max         = codeSnippet;
                        maxCount    = loc.length;
                    }
                } else {

                    if(loc.length > maxCount){
                        max = codeSnippet;
                    }
                }
            }

            if(typeof max == 'undefined'){
                _.was_error("Could not find a suitable code snippet");
            } else {
                var code_sample = max;

                // todo(Huascar) maybe call Vesperin and use the compilation status as a
                // way to select what code snippet to curate.
                // "Clean" up the code
                code_sample = code_sample.replace("<code>", "").replace("</code>", "");
                code_sample = code_sample.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
                //code_sample = code_sample.replace(/(console.log|alert)\(/g, "log("); // 'log' does nothing

                console.log(code_sample);


                if(_.candidates.length >= 50){ // arbitrary number
                    _.chooseCandidates(false);
                } else {
                    _.candidates.push(_.answers[_.item]);
                    _.get_next_answer("Keeping this code snippet");
                }

            }


        },

        test_results: function(value) {
            try {
                var output = JSON.stringify(value);
                if(value && typeof value === 'object' && Object.keys(value).length > 0) {
                    $('#output').val(output);
                    _.logger("Your array was sorted!", "success");

                    var answer_id = _.answers[_.item].answer_id;
                    var link = _.answers[_.item].link;
                    $('#answer-used a').attr({'href': link}).text(answer_id);

                    $('#sort').attr('disabled', false).text('Sort Again');
                    _.wait(false);
                    _.item++;
                    setTimeout(function() {
                        $('.done').fadeIn();
                    }, 400);
                } else {
                    _.was_error("Didn't return a value.");
                }
            } catch (e) {
                _.was_error("Didn't return a valid list.");
            }
        },

        wait: function (state) {
            $('.sad-waiter').css({
                height: state ? 137 : 0
            }).find('.hour, .minute').css({
                display: state ? 'block' : 'none'
            });
            $('#stopper').toggleClass('hide', !state);
        }
    };

    _.wait(false);

    $('#sort').click(function() {
        // Disclaimer
        // TODO: Use better modal?
        var warn = "Ready for fetching arbitrary Java code from StackOverflow?";
        var ready = window.localStorage.ss_confirmed || confirm(warn);
        if(!ready) {
            return false;
        }
        window.localStorage.ss_confirmed = true;

        _.reset();

        $('#sort').attr('disabled', true).text('Searching...');
        $('#logger .oc').remove();
        $('#displayer .oc').remove();
        _.stop = false;

        _.run_snippet();
    });

    $('#stop').click(function() {
        _.stop = true;
        return false;
    });

});
