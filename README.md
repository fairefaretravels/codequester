CodeQuestER

Drive. Explore. Discover. Survive.

CodeQuestER is a browser-based 3D driving and exploration game built with Three.js. Explore the city, discover locations, follow quests, and listen to music while driving.

Play the game: https://fairefaretravels.github.io/codequester/

Features

* 3D city driving and free-look camera.
* Keyboard and mobile driving controls.
* Track progress, laps, score, and location discovery.
* In-game music catalog and compact tape deck.
* Mackinthedark live radio integration.
* Energy Vampires combat add-on with silver bullets, weapons, cash, energy, and level progression.

Some features may still be under development.

Controls

Key	Action
W / Up Arrow	Accelerate
S / Down Arrow	Brake / reverse
A / Left Arrow	Steer left
D / Right Arrow	Steer right
C	Toggle drive / look camera
Q, E, R, F	Look around in look mode
T	Toggle steering direction
M	Play / pause audio
N	Next track

On mobile, use the on-screen driving controls and steering wheel. Use the tape deck to control music and switch to live radio.

Project Files

File	Purpose
index.html	Page shell and script loading
main.js	Game scene, driving, camera, HUD, and quests
trackgenerator.js	Track generation
music.js	Music catalog and playback
locations.js	Discoverable locations
cityvisuals.js	City visual enhancements
drivercontrols.js	Steering wheel and driving controls
tapedeck.js	Music player and live-radio controls
energyvampires.js	Vampire combat, weapons, and levels

Script Load Order

Keep the scripts in index.html in this order:

1. Three.js
2. trackgenerator.js
3. music.js
4. locations.js
5. cityvisuals.js
6. main.js
7. energyvampires.js
8. drivercontrols.js
9. tapedeck.js

Include each script only once. The game uses regular browser scripts, not ES modules.

Run Locally

Run a local web server from the project folder:

python -m http.server 8000

Then visit http://localhost:8000 in your browser.

Development Notes

* Preserve the script load order when adding features.
* Test both desktop and mobile after changing controls or the HUD.
* Browsers may require a user tap before audio can play.
* Test live-radio playback in the target browser.
* Avoid changing driving mechanics when making visual-only updates.

Links

* Live game: https://fairefaretravels.github.io/codequester/
* Source repository: https://github.com/fairefaretravels/codequester
