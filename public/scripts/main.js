/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';


// Shortcuts to DOM Elements.
var messageForm = document.getElementById('message-form');
var messageInput = document.getElementById('new-post-message');
var titleInput = document.getElementById('new-post-title');
var signInButton = $('#sign-in-button');
var signInAnonButton = $('#sign-in-anon-button');

var signOutButton = $('#sign-out-button');
var splashPage = document.getElementById('page-splash');
var addPost = document.getElementById('add-post');
var addButton = $('#add');
var givesPostsSection = document.getElementById('gives-posts-list');
var asksPostsSection = document.getElementById('asks-posts-list');
var userPostsSection = document.getElementById('user-posts-list');
var topUserPostsSection = document.getElementById('top-user-posts-list');

var givesMenuButton = $('#menu-gives');
var asksMenuButton = $('#menu-asks');

var myPostsMenuButton = $('#menu-my-posts');

var giveToggle = $('#give-toggle');
var askToggle = $('#ask-toggle');

var intro = document.getElementById('intro');

var listeningFirebaseRefs = [];

/**
 * Saves a new post to the Firebase DB.
 */
// [START write_fan_out]
function writeNewPost(uid, username, picture, title, body, type) {
  // A post entry.
  var postData = {
    author: username,
    uid: uid,
    body: body,
    title: title,
    starCount: 0,
    authorPic: picture,
    type: type,
  };
  
  // Get a key for a new Post.
  var newPostKey = firebase.database().ref().child('posts').push().key;

  // Write the new post's data simultaneously in the posts list and the user's post list.
  var updates = {};
  updates['/posts/' + newPostKey] = postData;
  updates['/user-posts/' + uid + '/' + newPostKey] = postData;

  return firebase.database().ref().update(updates);
}
// [END write_fan_out]

/**
 * Star/unstar post.
 */
// [START post_stars_transaction]
function toggleStar(postRef, uid) {
  postRef.transaction(function(post) {
    if (post) {
      if (post.stars && post.stars[uid]) {
        post.starCount--;
        post.stars[uid] = null;
      } else {
        post.starCount++;
        if (!post.stars) {
          post.stars = {};
        }
        post.stars[uid] = true;
      }
    }
    return post;
  });
}
// [END post_stars_transaction]

/**
 * Deletes the given postElement.
 */
function deletePost(postRef) {
  postRef.remove();
}


function postTemplate(postId, isUser) {
  var html = '<div class="post post-' + postId + ' mdl-cell mdl-cell--12-col ' +
                  'mdl-cell--6-col-tablet mdl-cell--4-col-desktop mdl-grid mdl-grid--no-spacing">' +
        '<div class="mdl-card mdl-shadow--2dp">' +
          '<div class="mdl-card__title mdl-color--light-blue-600 mdl-color-text--white">' +
            '<h4 class="mdl-card__title-text"></h4>' +
          '</div>' +
          '<div class="header">' +
            '<div>' +
              '<div class="avatar"></div>' +
              '<div class="username mdl-color-text--black"></div>' +
            '</div>' +
          '</div>' +
          '<span class="star">';
    // Add the delete button
    if (isUser) {
      html += '<div class="delete-post material-icons">delete</div>';
    }
    html += '<div class="not-starred material-icons">star_border</div>' +
            '<div class="starred material-icons">star</div>' +
          '</span>' +
          '<div class="text"></div>' +
          '<div class="comments-container"></div>' +
          '<form class="add-comment" action="#">' +
            '<div class="mdl-textfield mdl-js-textfield">' +
              '<input class="mdl-textfield__input new-comment" type="text">' +
              '<label class="mdl-textfield__label">Respond to this post..</label>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';
  return html;
}

/**
 * Creates a post element.
 */
function createPostElement(postId, title, text, author, authorId, authorPic, commentsEnabled) {
  var uid = firebase.auth().currentUser.uid;

  var html = postTemplate(postId, commentsEnabled);
      
  // Create the DOM element from the HTML.
  var div = document.createElement('div');
  div.innerHTML = html;
  var postElement = div.firstChild;
  if (componentHandler) {
    componentHandler.upgradeElements(postElement.getElementsByClassName('mdl-textfield')[0]);
  }

  var addCommentForm = postElement.getElementsByClassName('add-comment')[0];
  var commentInput = postElement.getElementsByClassName('new-comment')[0];
  var star = postElement.getElementsByClassName('starred')[0];
  var unStar = postElement.getElementsByClassName('not-starred')[0];
  var trash = postElement.getElementsByClassName('delete-post')[0];

  // Set values.
  postElement.getElementsByClassName('text')[0].innerText = text;
  postElement.getElementsByClassName('mdl-card__title-text')[0].innerText = title;
  postElement.getElementsByClassName('username')[0].innerText = author || 'Anonymous';
  postElement.getElementsByClassName('avatar')[0].style.backgroundImage = 'url("' +
      (authorPic || './silhouette.jpg') + '")';

  // Listen for comments.
  // [START child_event_listener_recycler]
  var commentsRef = firebase.database().ref('post-comments/' + postId);
  if (commentsEnabled) {
    commentsRef.on('child_added', function(data) {
      addCommentElement(postElement, data.key, data.val().text, data.val().author);
    });
  }

  commentsRef.on('child_changed', function(data) {
    setCommentValues(postElement, data.key, data.val().text, data.val().author);
  });

  commentsRef.on('child_removed', function(data) {
    deleteComment(postElement, data.key);
  });
  // [END child_event_listener_recycler]

  // Listen for likes counts.
  // [START post_value_event_listener]
  // var starCountRef = firebase.database().ref('posts/' + postId + '/starCount');
  // starCountRef.on('value', function(snapshot) {
  //   updateStarCount(postElement, snapshot.val());
  // });
  // [END post_value_event_listener]

  // Listen for the starred status.
  var starredStatusRef = firebase.database().ref('posts/' + postId + '/stars/' + uid);
  starredStatusRef.on('value', function(snapshot) {
    updateStarredByCurrentUser(postElement, snapshot.val());
  });

  // Keep track of all Firebase reference on which we are listening.
  listeningFirebaseRefs.push(commentsRef);
  // listeningFirebaseRefs.push(starCountRef);
  listeningFirebaseRefs.push(starredStatusRef);

  // Create new comment.
  addCommentForm.onsubmit = function(e) {
    e.preventDefault();
    createNewComment(postId, firebase.auth().currentUser.displayName, uid, commentInput.value);
    commentInput.value = '';
    commentInput.parentElement.MaterialTextfield.boundUpdateClassesHandler();
  };

  // Bind starring action.
  var onStarClicked = function() {
    var globalPostRef = firebase.database().ref('/posts/' + postId);
    var userPostRef = firebase.database().ref('/user-posts/' + authorId + '/' + postId);
    toggleStar(globalPostRef, uid);
    toggleStar(userPostRef, uid);
  };
  unStar.onclick = onStarClicked;
  star.onclick = onStarClicked;

  // Bind deleting action.
  var onTrashClicked = function() {
    var globalPostRef = firebase.database().ref('/posts/' + postId);
    var userPostRef = firebase.database().ref('/user-posts/' + authorId + '/' + postId);
    deletePost(globalPostRef);
    deletePost(userPostRef);
  };

  if (trash) {
    // and I mean, jQuery is trash
    var jqueryTrash = $(trash);
    jqueryTrash.bind('click touchstart', onTrashClicked);
  }

  return postElement;
}

/**
 * Writes a new comment for the given post.
 */
function createNewComment(postId, username, uid, text) {
  firebase.database().ref('post-comments/' + postId).push({
    text: text,
    author: username,
    uid: uid
  });
}

/**
 * Updates the starred status of the post.
 */
function updateStarredByCurrentUser(postElement, starred) {
  if (starred) {
    postElement.getElementsByClassName('starred')[0].style.display = 'inline-block';
    postElement.getElementsByClassName('not-starred')[0].style.display = 'none';
  } else {
    postElement.getElementsByClassName('starred')[0].style.display = 'none';
    postElement.getElementsByClassName('not-starred')[0].style.display = 'inline-block';
  }
}

/**
 * Updates the number of stars displayed for a post.
 */
function updateStarCount(postElement, nbStart) {
  postElement.getElementsByClassName('star-count')[0].innerText = nbStart;
}

/**
 * Creates a comment element and adds it to the given postElement.
 */
function addCommentElement(postElement, id, text, author) {
  var comment = document.createElement('div');
  comment.addClass('comment-' + id);
  comment.innerHTML = '<span class="username"></span><span class="comment"></span>';
  comment.getElementsByClassName('comment')[0].innerText = text;
  comment.getElementsByClassName('username')[0].innerText = author || 'Anonymous';

  var commentsContainer = postElement.getElementsByClassName('comments-container')[0];
  commentsContainer.appendChild(comment);
}

/**
 * Sets the comment's values in the given postElement.
 */
function setCommentValues(postElement, id, text, author) {
  var comment = postElement.getElementsByClassName('comment-' + id)[0];
  comment.getElementsByClassName('comment')[0].innerText = text;
  comment.getElementsByClassName('fp-username')[0].innerText = author;
}

/**
 * Deletes the comment of the given ID in the given postElement.
 */
function deleteComment(postElement, id) {
  var comment = postElement.getElementsByClassName('comment-' + id)[0];
  comment.parentElement.removeChild(comment);
}


/**
 * Starts listening for new posts and populates posts lists.
 */
function startDatabaseQueries() {
  // [START my_top_posts_query]
  var myUserId = firebase.auth().currentUser.uid;
  // var topUserPostsRef = firebase.database().ref('user-posts/' + myUserId).orderByChild('starCount');
  // [END my_top_posts_query]
  // [START recent_posts_query]
  var givesPostsRef = firebase.database().ref('posts').orderByChild("type").equalTo("give");
  var asksPostsRef = firebase.database().ref('posts').orderByChild("type").equalTo("ask");

  // [END recent_posts_query]
  var userPostsRef = firebase.database().ref('user-posts/' + myUserId);

  var fetchPosts = function(postsRef, sectionElement, commentsEnabled) {
    postsRef.on('child_added', function(data) {
      var author = data.val().author || 'Anonymous';
      var containerElement = sectionElement.getElementsByClassName('posts-container')[0];
      containerElement.insertBefore(
        createPostElement(data.key, data.val().title, data.val().body, author, data.val().uid, data.val().authorPic, commentsEnabled),
        containerElement.firstChild);
    });
    postsRef.on('child_changed', function(data) {
      var containerElement = sectionElement.getElementsByClassName('posts-container')[0];
      var postElement = containerElement.getElementsByClassName('post-' + data.key)[0];
      postElement.getElementsByClassName('mdl-card__title-text')[0].innerText = data.val().title;
      postElement.getElementsByClassName('username')[0].innerText = data.val().author;
      postElement.getElementsByClassName('text')[0].innerText = data.val().body;
      // postElement.getElementsByClassName('star-count')[0].innerText = data.val().starCount;
    });
    postsRef.on('child_removed', function(data) {
      var containerElement = sectionElement.getElementsByClassName('posts-container')[0];
      var post = containerElement.getElementsByClassName('post-' + data.key)[0];
      post.parentElement.removeChild(post);
    });
  };

  // Fetching and displaying all posts of each sections.
  // fetchPosts(topUserPostsRef, topUserPostsSection, false);
  fetchPosts(givesPostsRef, givesPostsSection, false);  
  fetchPosts(asksPostsRef, asksPostsSection, false);  
  fetchPosts(userPostsRef, userPostsSection, true);

  // Keep track of all Firebase refs we are listening to.
  // listeningFirebaseRefs.push(topUserPostsRef);
  listeningFirebaseRefs.push(givesPostsRef);
  listeningFirebaseRefs.push(asksPostsRef);
  listeningFirebaseRefs.push(userPostsRef);
}

/**
 * Writes the user's data to the database.
 */
// [START basic_write]
function writeUserData(userId, name, email, imageUrl) {
  firebase.database().ref('users/' + userId).set({
    username: name,
    email: email,
    profile_picture : imageUrl
  });
}
// [END basic_write]

/**
 * Cleanups the UI and removes all Firebase listeners.
 */
function cleanupUi() {
  // Remove all previously displayed posts.
  topUserPostsSection.getElementsByClassName('posts-container')[0].innerHTML = '';
  givesPostsSection.getElementsByClassName('posts-container')[0].innerHTML = '';
  userPostsSection.getElementsByClassName('posts-container')[0].innerHTML = '';

  // Stop all currently listening Firebase listeners.
  listeningFirebaseRefs.forEach(function(ref) {
    ref.off();
  });
  listeningFirebaseRefs = [];
}


/**
 * The ID of the currently signed-in User. We keep track of this to detect Auth state change events that are just
 * programmatic token refresh but not a User status change.
 */
var currentUID;

/**
 * Triggers every time there is a change in the Firebase auth state (i.e. user signed-in or user signed out).
 */
function onAuthStateChanged(user) {
  // We ignore token refresh events.
  if (user && currentUID === user.uid) {
    return;
  }

  cleanupUi();
  if (user) {
    currentUID = user.uid;
    splashPage.style.display = 'none';
    try {
      writeUserData(user.uid, user.displayName, user.email, user.photoURL);
    }
    catch(err) {
      var isAnonymous = user.isAnonymous;
    }

    // load Google Maps API once user has logged in
    var script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + config.maps_key + '&callback=getUserLocation';
    script.defer = true;
    script.async = true;

    window.getUserLocation = function(){
      function success(position){
        var geocoder = new google.maps.Geocoder();
        var latlng = {lat: position.coords.latitude, lng: position.coords.longitude};
        try{
          geocoder.geocode({'location': latlng}, function(results, status){
            if (status == 'OK'){
              if (results[0]){
                results[0].address_components.forEach(function(item, index){
                  if (item.types[0] == 'postal_code'){
                    console.log(item.long_name);
                  }
                });
              }
            }
          });
        }
        catch (err){
          console.log(err);
        }
      }
      function error(){
        console.log('unable to retrieve location');
      }
      if (navigator.geolocation){
        navigator.geolocation.getCurrentPosition(success, error);
      } else {
        console.log('Browser does not support geolocation');
      }
    
    }

    document.head.appendChild(script);

    startDatabaseQueries();
  } else {
    // Set currentUID to null.
    currentUID = null;
    // Display the splash page where you can sign-in.
    splashPage.style.display = '';
  }
}

/**
 * Creates a new post for the current user.
 */
function newPostForCurrentUser(title, text, askgive) {
  // [START single_value_read]
  var userId = firebase.auth().currentUser.uid;
  return firebase.database().ref('/users/' + userId).once('value').then(function(snapshot) {
    var username = (snapshot.val() && snapshot.val().username) || 'Anonymous';
    // [START_EXCLUDE]
    return writeNewPost(firebase.auth().currentUser.uid, username,
      firebase.auth().currentUser.photoURL,
      title, text, askgive);
    // [END_EXCLUDE]
  });
  // [END single_value_read]
}

/**
 * Displays the given section element and changes styling of the given button.
 */
function showSection(sectionElement, buttonElement) {
  givesPostsSection.style.display = 'none';
  asksPostsSection.style.display = 'none';
  userPostsSection.style.display = 'none';
  topUserPostsSection.style.display = 'none';
  addPost.style.display = 'none';
  givesMenuButton.removeClass('is-active');
  asksMenuButton.removeClass('is-active');
  myPostsMenuButton.removeClass('is-active');
  // myTopPostsMenuButton.removeClass('is-active');

  if (sectionElement) {
    sectionElement.style.display = 'block';
  }
  if (buttonElement) {
    buttonElement.addClass('is-active');
  }

  // show intro if add-posts or user-posts section is not displayed
  if (sectionElement.id == 'add-post' || sectionElement.id == 'user-posts-list') {
    intro.style.display = 'none';
  } else {
    intro.style.display = 'block';
  }
}

// Bindings on load.
window.addEventListener('load', function() {
  // Bind Sign in button.
  signInButton.on('click touchstart', function() {
    var provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider);
  });

  signInAnonButton.on('click touchstart', function() {
    firebase.auth().signInAnonymously().catch(function(error) {
      // Handle Errors here.
      var errorCode = error.code;
      var errorMessage = error.message;
      // ..
    });
  });

  // Bind Sign out button.
  signOutButton.on('click touchstart', function() {
    firebase.auth().signOut();
  });

  // Listen for auth state changes
  firebase.auth().onAuthStateChanged(onAuthStateChanged);

  var askgive = 'give';

  giveToggle.on('click touchstart', function() {
    askgive = 'give';
    giveToggle.removeClass('mdl-button--disabled');
    giveToggle.addClass('toggle-on');
    askToggle.addClass('mdl-button--disabled');   
  });

  askToggle.on('click touchstart', function() {
    askgive = 'ask';
    askToggle.removeClass('mdl-button--disabled');
    askToggle.addClass('toggle-on');
    giveToggle.addClass('mdl-button--disabled');
  });

  // Saves message on form submit.
  messageForm.onsubmit = function(e) {
    e.preventDefault();
    var text = messageInput.value;
    var title = titleInput.value;
    if (text && title) {
      newPostForCurrentUser(title, text, askgive).then(function() {
        showSection(userPostsSection, myPostsMenuButton);
      });
      messageInput.value = '';
      titleInput.value = '';
    }
  };

  // Bind menu buttons.
  givesMenuButton.on('click touchstart', function() {
    showSection(givesPostsSection, givesMenuButton);
  });
  asksMenuButton.on('click touchstart', function() {
    showSection(asksPostsSection, asksMenuButton);
  });
  myPostsMenuButton.on('click touchstart', function() {
    showSection(userPostsSection, myPostsMenuButton);
  });
  // myTopPostsMenuButton.on('click touchstart', function() {
  //   showSection(topUserPostsSection, myTopPostsMenuButton);
  // };
  addButton.on('click touchstart', function() {
    
    showSection(addPost);
    messageInput.value = '';
    titleInput.value = '';
  });

  showSection(givesPostsSection, givesMenuButton);
  // givesMenuButton.onclick();
  // asksMenuButton.onclick();

}, false);
