
let Session = {

	tool: "",

	user: null,

	currentUsers: new Map(),
	userCache: new Map(),

	initialized: false,

	spoolItUp: function() {
		DebugsBunny.log("spooling up");
		Session.init();

		if (CURRENT_USER !== null) {
			document.getElementById("loadingMessage").innerText = "Connecting...";

			Session.user = CURRENT_USER; //Session.deserializeUser(CURRENT_USER);


			let macheKeyFromURL = window.location.href.split('/e/')[1].split('?')[0];
			socket = io.connect('/macheSpace', {transports: [ 'websocket' ], query: "mache="+macheKeyFromURL});
			//socket = io.connect('/macheSpace');

			MessageMomma.initHandlers();
		}
		else {
			if(CURRENT_USER === null) {
				UIGuy.showPopup('loginPopup');
			}
		}
	},

	welcomeToTheMache: function(msg) {
		DebugsBunny.log("we've been expecting you");

		PreferencePal.set(Session.user.preferences);

		this.updateMacheState(msg.mache, msg.meta);
		this.updateMacheUsers(msg.activeMache.activeUsers);

		if(RingMaster.presenting)
		{
			console.log("reconnected behind the scenes");
		}
		else
		{
			MessageMomma.machePlease();
		}
	},

	updateMacheState: function(macheState, meta) {
		let isDeep = false;
		if(meta && meta.depth && meta.depth == "deep")
			isDeep = true;

		if(Session.mache) {
			Session.mache.updateState(macheState, isDeep);
		}
		else {
			Session.mache = new Mache(macheState.key);
			Session.mache.load(macheState, isDeep);
		}
	},

	loadMache: function(deepMache) {
		if(Session.mache) {
			Session.mache.load(deepMache, true);
			this.macheInitialized();
			$(".se-pre-con").fadeOut("slow");;
		}
		else {
			DebugsBunny.error("we should not be loading the mache id there isnt already a mache set")
		}
	},

	macheInitialized: function() {
		ActiveUsersDisplay.updateCurrentUserDisplay(Session.user);

		// initialize jitsi session - turning off for now - nic
		/*
		Live.conferenceId = Session.mache._id;
		Live.userDisplayName = Session.user._id;
		Live.init();
		*/

		// update mache title display
		UIGuy.updateMacheDetails();

		// move the camera to a good starting point
		// at the moment, just show the whole mache - TOIMPROVE NicL 6/22/16
		let cameraParams = Session.getCameraParams();

		if(cameraParams != "") {
			Camera.moveTo(cameraParams.x, cameraParams.y, cameraParams.zoom);
			Pen.previouszoom = Camera.zoom;
		}
		else {
			Camera.showAll();
		}
		
		// initialize Viewports after the initial camera position is set
		Viewports.init();

		// if there is a specific element param, go to that element
		let elementParams = Session.getElementParams();
		if(elementParams != "") {
			DebugsBunny.log("element id: "+elementParams.id);
			let elem = Session.mache.elements.get(elementParams.id);
			if(elem != null) {
				Camera.centerOnElement(elem, 0.8, true);

				if(elementParams.info) {
					SemanticSultan.showInfoForElements([elem]);
				}
			}
		}

		RingMaster.init();
		UIGuy.hideReconnectingOverlay();
		UIGuy.updateToolVisibility();
		UIGuy.activateTool("select");
		CameraJockey.updateUserCamera(true);
		ChatterBox.loadChats();
		InstructorElementHighlighter.highlightInstructorElements();
		Session.initialized = true;
	},

	init: function() {
		Session.space = document.getElementById("space");

		UIGuy.init();
		Camera.init();
		//PixiCamera.init();
		SemanticSultan.init();
		Pen.init();
		SelectionBox.init();
		TransformTools.init();
		ClippingControls.init();
		AwarenessAnnie.init();
		ShapeShifter.init();
		Scribe.init();
		HistoryStack.init();
		FatherTime.init();
		ChatterBox.init();
		HeadTank.init();
		Lumberjack.init();
		EphemeralTrace.init();

		//Observer = new IntersectionObserver(Camera.onIntersectionsUpdate);

		Session.canvasStackMenu = new StackMenu(CANVAS_STACK_RECIPE);
		Session.elementStackMenu = new StackMenu(ELEMENT_STACK_RECIPE);

		Session.canvasCakeMenu = new CakeMenu(CANVAS_CAKE_RECIPE);
		Session.elementCakeMenu = new CakeMenu(ELEMENT_CAKE_RECIPE);

		this.attachListeners();

		SemanticSultan.updateDebugInfo();
	},

	/** event handlers **/
	attachListeners: function() {
		//Session.space.addEventListener("mousedown", MouseHandler.spaceMouse_Down);
		//Session.space.addEventListener("mouseup", MouseHandler.spaceMouse_Up);
		InputEventWrapper.addListeners(Session.space, 1, MouseHandler.spaceMouse_Down);
		InputEventWrapper.addListeners(Session.space, 3, MouseHandler.spaceMouse_Up);

		// global pointerUp evCache remover
		InputEventWrapper.addListeners(document, 3, MouseHandler.pointer_Up);

		window.addWheelListener(Session.space, MouseHandler.spaceMouse_Wheel);

		window.addEventListener('keydown', KeyHandler.keyDown);
		window.addEventListener("keyup", KeyHandler.keyUp);
		window.addEventListener("blur", KeyHandler.clearKeys);

		window.addEventListener("beforeunload", Session.exit);

		Session.space.addEventListener('drop', DropDaddy.catchDrop);
		Session.space.addEventListener('dragover', DropDaddy.dragOver);

		Session.space.addEventListener('scroll', Camera.handleAutoScroll);

		Session.space.addEventListener("contextmenu", MouseHandler.contextMenu);
		window.addEventListener("contextmenu", MouseHandler.contextMenu);

		window.addEventListener('resize', Camera.onResize);

		window.addEventListener("paste", CopyPastaHandler.handlePaste);
		window.addEventListener("copy", CopyPastaHandler.handleCopy);
		window.addEventListener("cut", CopyPastaHandler.handleCut);

		window.addEventListener("pasteResponse", CopyPastaHandler.pasteCallback);

		//window.addEventListener("mousemove", MouseHandler.pointerWatch_Move);
		InputEventWrapper.addListeners(window, 2, MouseHandler.pointerWatch_Move);

		this.userSearcher = new UserSearch("newUserName", "newUserImg", "addUserButton");
	},

	updateMacheUsers: function(activeUsers) {
		// check for joining or leaving user

		//DebugsBunny.log("currentUsers: "+Session.currentUsers.size + " | "+activeUsers.length);
		if(activeUsers.length > Session.currentUsers.size) {
			// user must have joined
			MusicMan.play_UserJoined();
		}
		else if(activeUsers.length < Session.currentUsers.size) {
			// a user must have left
			MusicMan.play_UserLeft();
		}

		//maintain set of current user ids by their mongo IDs
		Session.currentUsers.clear();

		let currentUserID = Session.user._id;
		for(let i = 0; i < activeUsers.length; i++)	{
			if(activeUsers[i].userId === currentUserID) {
				Session.user.color = activeUsers[i].color;
			}
			Session.currentUsers.set(activeUsers[i].userId, activeUsers[i]);
		}

		ActiveUsersDisplay.updateCurrentUserDisplay(Session.user);
		ActiveUsersDisplay.updateActiveUsersDisplay();
		UIGuy.updateUserRolesDisplay();
		ChatterBox.updateChatUserColors();
	},

	getUserInfo: function(userId) {
		let userPromise = new Promise(function(resolve, reject) {
			if(Session.userCache.has(userId)) {
				let user = Session.userCache.get(userId);
				if(Session.currentUsers.has(userId)) {
					user.color = Session.currentUsers.get(userId).color;
				}
				else {
					user.color = '#222233';
				}
				 Session.userCache.set(userId, user);

				resolve(Session.userCache.get(userId));
			}
			else {

				let url = "/u/getUsers/";
				fetch(url, {
			    method : "POST",
			    body: JSON.stringify({userLocator : { id : userId } }),
				  headers:{
				    'Content-Type': 'application/json'
				  }
				})
				.then( response => response.json())
				.then( res => {
						for(let u in res) {
							let user = res[u];
							if(Session.currentUsers.has(user._id)) {
								user.color = Session.currentUsers.get(user._id).color;
							}
							else {
								user.color = '#222233';
							}
							Session.userCache.set(user._id, user);
						}
	      		resolve(Session.userCache.get(userId));
					})
				.catch(error => reject(error));
			}
		});
		return userPromise;
	},

	closeAllMenus: function() {
		Session.canvasStackMenu.close();
		Session.elementStackMenu.close();

		Session.canvasCakeMenu.close();
		Session.elementCakeMenu.close();

		if(Session.tool != "text")
			Scribe.end();
	},

	updateURL: function() {
		let oldParams = Util.getUrlVars();

		// build the url with the title, camera position, and any open elements
		let params_string = "?";

		// camera position
		params_string += encodeURI('cX') + '=' + encodeURI(Util.roundTo(Camera.x, 2));
		params_string += "&" + encodeURI('cY') + '=' + encodeURI(Util.roundTo(Camera.y, 2));
		params_string += "&" + encodeURI('cZ') + '=' + encodeURI(Camera.zoom);

		for(let param in oldParams) {
			if(param != "cX" && param != "cY" && param != "cZ") {
				params_string += "&" + encodeURI(param) + '=' + encodeURI(oldParams[param]);
			}
		}

		window.history.replaceState({}, "", window.location.pathname + params_string);
	},

	getCameraParams: function() {
		let urlVars = Util.getUrlVars();

		if(urlVars.cX && urlVars.cX != ""
			&& urlVars.cY && urlVars.cY != ""
			&& urlVars.cZ && urlVars.cZ != "") {
			return {
				x: parseFloat(urlVars.cX),
				y: parseFloat(urlVars.cY),
				zoom: parseFloat(urlVars.cZ)
			};
		}

		return "";
	},

	getElementParams: function() {
		let urlVars = Util.getUrlVars();

		if(urlVars.element && urlVars.element != "") {
			let elementID = urlVars.element;

			if(Session.mache.elements.has(elementID)) {
				let info = false;

				if(urlVars.info && urlVars.info == "true") {
					info = true;
				}

				return {
					id: elementID,
					info: info
				};
			}
		}
		return "";
	},

	checkStudyParams: function(){
		let urlVars = Util.getUrlVars();

		if(urlVars.aw && urlVars.aw == "off")
			AwarenessAnnie.ACTIVE = false;
		if(urlVars.eph && urlVars.eph == "off")
			EphemeralTrace.ACTIVE = false;
		if(urlVars.mm && urlVars.mm == "open")
			UIGuy.toggleMinimap();
		if(urlVars.lazyZoom && urlVars.lazyZoom == "on")
			Camera.lazyZoom = true;
		if(urlVars.iconsOnly && urlVars.iconsOnly == "on")
			Camera.iconsOnly = true;
	},

	exit: function(event)	{
		// release all locks please
		MessageMomma.releaseAllLocks();6
		DebugsBunny.log("Goodbye my love.");
	},

	copyMache: function() {
		if(Session.mache != null) {
			
			$.post( "/e/copyMache", { 
				macheLocator: { 
					key : Session.mache.key
				}
			}).done(function( data ) { 
				//window.location.href = window.location.protocol + "//" + window.location.host + "/";
			});
		}
	},

	deleteMache: function() {
		if(Session.mache != null) {
			
			$.post( "/e/removeMache", { 
				macheLocator: { 
					key : Session.mache.key
				}
			}).done(function( data ) { 
				window.location.href = window.location.protocol + "//" + window.location.host + "/";
			});
		}
	},

};
