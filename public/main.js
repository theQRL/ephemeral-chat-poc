/* eslint comma-dangle: 0, no-console: 0, no-use-before-define: 0, no-param-reassign: 0 */
/* global $, io, eccrypto , moment */
$(function () {
  var FADE_TIME = 150; // ms
  var TYPING_TIMER_LENGTH = 400; // ms
  var COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  var $window = $(window);
  var $usernameInput = $('.usernameInput'); // Input for username
  var $messages = $('#scroller-window'); // Messages area
  var $inputMessage = $('.inputMessage'); // Input message input box

  var $loginPage = $('.login.page'); // The login page
  var $chatPage = $('.chat.page'); // The chatroom page

  // Prompt for setting a username
  var username;
  var connected = false;
  var typing = false;
  var lastTypingTime;
  var $currentInput = $usernameInput.focus();

  var socket = io();

  const addParticipantsMessage = (data) => {
    var message = '';
    if (data.numUsers === 1) {
      message += 'You are the only person here';
    } else {
      message += 'There are ' + data.numUsers + ' participants';
    }
    log(message);
  };

  // Sets the client's username
  const setUsername = () => {
    $('#userlist .me').remove();
    username = cleanInput($('#user-name').val().trim());

    // If the username is valid
    if (username) {
      // Tell the server your username
      console.log('telling the server my new username...', username);
      socket.emit('add user', username);
      $('#userlist').append('<a class="item me">' + username
      + '<div class="ui small red label">&nbsp;<i class="ui icontext icon">X </i> PK</div></a>');
    }
  };

  // Sends a chat message
  const sendMessage = () => {
    var message = $inputMessage.val();
    // Prevent markup from being injected into the message
    message = cleanInput(message);

    if ($('#PK').val() !== '') {
      const pk = $('#PK').val();
      const pkB = Buffer.Buffer.from(pk.toString(), 'hex');

      eccrypto.encrypt(pkB, Buffer.Buffer.from(message)).then(function (encrypted) {

        const eMessage = ['[', JSON.stringify(encrypted), ']'].join('');
                // if there is a non-empty message and a socket connection
    if (eMessage && connected) {
      $inputMessage.val('');
      addChatMessage({
        username: username,
        message: eMessage
      });
      // tell server to execute 'new message' and send along one parameter
      socket.emit('new message', eMessage);
    }
      });
    } else {
      // if there is a non-empty message and a socket connection
      if (message && connected) {
        $inputMessage.val('');
        addChatMessage({
          username: username,
          message: message
        });
        // tell server to execute 'new message' and send along one parameter
        socket.emit('new message', message);
      }
    }
  };

  // Log a message
  const log = (message) => {
    var CurrentDate = moment().format();
    var $el = $('<p>').addClass('log').text(CurrentDate + ' ' + message);
    $('#status-log').append($el);
  };

  const isEphemeralMessage = (message) => {
    try {
      if (JSON.parse(message)[0].iv.type === 'Buffer') {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options) => {
    // Don't fade the message in if there is an 'X was typing'
    var $typingMessages = getTypingMessages(data);
    options = options || {};
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    if (isEphemeralMessage(data.message)) {
      var $usernameDiv = $('<span class="username"/>')
        .text(data.username + ' [private]')
        .css('color', getUsernameColor(data.username));
      var payload = JSON.parse(data.message)[0];
      var msg =  {
        iv: Buffer.Buffer.from(payload.iv.data),
        ephemPublicKey: Buffer.Buffer.from(payload.ephemPublicKey.data),
        ciphertext: Buffer.Buffer.from(payload.ciphertext.data),
        mac: Buffer.Buffer.from(payload.mac.data),
      };
      // const ecdsaSK = '49798cf0bb6b33003934a0ab84c625a7506a6296b1e5f0d648fd7af3483ab40a';
      const ecdsaSK = $('#ecdsaSK').val();
      eccrypto.decrypt(Buffer.Buffer.from(ecdsaSK.toString(), 'hex'), msg).then(function (plaintext) {
        console.log(plaintext.toString());
        var $messageBodyDiv = $('<span class="messageBody">')
          .text(plaintext.toString());
        var typingClass = data.typing ? 'typing' : '';
        var $messageDiv = $('<li class="message"/>')
          .data('username', data.username)
          .addClass(typingClass)
          .append($usernameDiv, $messageBodyDiv);
        addMessageElement($messageDiv, options);
      }, function (e) {
        var $messageBodyDiv = $('<span class="messageBody">')
        .text('*** encrypted data - no secret key to decrypt ***');
      var typingClass = data.typing ? 'typing' : '';
      var $messageDiv = $('<li class="message"/>')
        .data('username', data.username)
        .addClass(typingClass)
        .append($usernameDiv, $messageBodyDiv);
      addMessageElement($messageDiv, options);
      });
    } else {
      var $usernameDiv = $('<span class="username"/>')
        .text(data.username + ' [public]')
        .css('color', getUsernameColor(data.username));
      var $messageBodyDiv = $('<span class="messageBody">')
        .text(data.message);
      var typingClass = data.typing ? 'typing' : '';
      var $messageDiv = $('<li class="message"/>')
        .data('username', data.username)
        .addClass(typingClass)
        .append($usernameDiv, $messageBodyDiv);
      addMessageElement($messageDiv, options);
    }
  };

  // Adds the visual chat typing message
  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  };

  // Removes the visual chat typing message
  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function () {
      $(this).remove();
    });
  };

  // Adds a message element to the messages and scrolls to the bottom
  // el - The element to add as a message
  // options.fade - If the element should fade-in (default = true)
  // options.prepend - If the element should prepend
  //   all other messages (default = false)
  const addMessageElement = (el, options) => {
    var $el = $(el);

    // Setup default options
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }

    // Apply options
    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }
    $messages[0].scrollTop = $messages[0].scrollHeight;
  };

  // Prevents input from having injected markup
  const cleanInput = input => $('<div/>').text(input).html();

  // Updates the typing event
  const updateTyping = () => {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(() => {
        var typingTimer = (new Date()).getTime();
        var timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  };

  // Gets the 'X is typing' messages of a user
  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function (i) {
      return $(this).data('username') === data.username;
    });
  };

  // Gets the color of a username through our hash function
  const getUsernameColor = (username) => {
    // Compute hash code
    var hash = 7;
    for (var i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    // Calculate color
    var index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  };

  // Keyboard events

  $window.keydown(event => {
    // Auto-focus the current input when a key is typed
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    // When the client hits ENTER on their keyboard
    if (event.which === 13) {
      if (username) {
        sendMessage();
        socket.emit('stop typing');
        typing = false;
      } else {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
  });

  $('#clear').click(() => {
    $('#PK').val('');
  });

  $('#clearS').click(() => {
    $('#KyberSK').val('');
    $('#DilithiumSK').val('');
    $('#ecdsaSK').val('');
    $('#eciesSK').val('');
  });

  // Click events

  // Focus input when clicking anywhere on login page
  $loginPage.click(() => {
    $currentInput.focus();
  });

  // Focus input when clicking on the message input's border
  $inputMessage.click(() => {
    $inputMessage.focus();
  });

  $('.dropdown').dropdown();
  $('.item').tab();
  $('.modal').modal({
    onApprove: function () {
      setUsername();
    }
  });

  $('#menu-profile').click(function () {
    $('.modal').modal('show');
  });

  log('Ready to connect');

  $('#new-private-chat').click(function () {
    $('.top').css('opacity', 0.2);
    $('.ui.bottom.fixed .item').css('opacity', 0.2);
    $('#public-chat').css('opacity', 0.2);
    $('#userlist .item .red').parent().css('opacity', 0.2);
    $('#cancel-new-private-chat').css('opacity', 1.0);
    $('#cancel-new-private-chat').show();
    $('#new-private-chat').hide();
  });

  $('#cancel-new-private-chat').click(function () {
    $('.top').css('opacity', 1.0);
    $('.ui.bottom.fixed .item').css('opacity', 1.0);
    $('#public-chat').css('opacity', 1.0);
    $('#userlist .item .red').parent().css('opacity', 1.0);
    $('#new-private-chat').show();
    $('#cancel-new-private-chat').hide();
  });

  $('#plug').click(function () {
    if ($('#plug').hasClass('red')) {
      log('Attempting to connect...');
      socket.emit('reconnect');
      $('#plug').removeClass('red'); // TODO: only when actually connected!
      $('#plug').addClass('green'); // TODO: only when actually connected!
    } else {
      log('Attempting to disconnect...');
      socket.emit('disconnect');
      $('#plug').removeClass('green'); // TODO: only when actually disconnected!
      $('#plug').addClass('red'); // TODO: only when actually disconnected!
    }
  });

  // Socket events

  // Whenever the server emits 'login', log the login message
  socket.on('login', (data) => {
    connected = true;
    // Display the welcome message
    var message = 'Connected to theqrl.org core dev team QRL Ephemeral Test Chat';
    log(message);
    addParticipantsMessage(data);
  });

  // Whenever the server emits 'new message', update the chat body
  socket.on('new message', (data) => {
    addChatMessage(data);
  });

  // Whenever the server emits 'user joined', log it in the chat body
  socket.on('user joined', (data) => {
    console.log('user joined, data is:');
    console.log(data);
    $('#userlist').append('<a class="item them">' + data.username
      + '<div class="ui small red label">&nbsp;<i class="ui icontext icon">X </i> PK</div></a>');
    log(data.username + ' joined');
    addParticipantsMessage(data);
  });

  // Whenever the server emits 'user left', log it in the chat body
  socket.on('user left', (data) => {
    log(data.username + ' left');
    addParticipantsMessage(data);
    removeChatTyping(data);
  });

  // Whenever the server emits 'typing', show the typing message
  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  // Whenever the server emits 'stop typing', kill the typing message
  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  socket.on('disconnect', () => {
    log('Disconnected');
    $('#userlist .me').remove();
    $('#userlist .them').remove();
  });

  socket.on('reconnect', () => {
    log('You have been connected');
    if (username) {
      socket.emit('add user', username);
    }
  });

  socket.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
  });
});
