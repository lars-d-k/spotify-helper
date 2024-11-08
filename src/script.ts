// Because this is a literal single page application
// we detect a callback from Spotify by checking for the hash fragment
import { redirectToAuthCodeFlow, getAccessToken } from "./authCodeWithPkce";

const clientId = "905dd5f352484d81a65a690fe3f0b4e6";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

// save query for later
const artistQuery = params.get('artist');
if (artistQuery && artistQuery != "") {
    localStorage.setItem('artist', artistQuery);
}

let profile: UserProfile;

if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    let accessToken;
    while (true) {
        accessToken = await getAccessToken(clientId, code);
        profile = await fetchProfile(accessToken);
        if (profile.error) {
            console.log(profile.error)
            redirectToAuthCodeFlow(clientId);
        } else {
            break;
        }
    }

    populateUI(profile, accessToken);

    let artistQuery = localStorage.getItem('artist');
    localStorage.removeItem('artist');
    let artistId = extractArtistId(artistQuery);
    if (artistId && confirm(`Would you like to use '${artistId}' for artist id`)) {
        await getSongs(accessToken, artistId);
    }
}

async function getSongs(accessToken: any, artistId: string | null) {
    // define html elements
    let headings = {
        title: document.getElementById("title")! as HTMLHeadingElement,
        subtitle: document.getElementById("subtitle")! as HTMLHeadingElement
    }

    let buttons = {
        getArtist: document.getElementById("get-artist")! as HTMLButtonElement, 
        copySongs: document.getElementById("copy-songs")! as HTMLButtonElement, 
        saveToPlaylist: document.getElementById("save-to-playlist")! as HTMLButtonElement
    }

    // get artist id if it isnt provided
    if (!artistId) {
        artistId = extractArtistId(prompt("artist id or url")) ?? "no artist provided";
    }
    
    // get artist
    console.log(`fetching artist for id '${artistId}'`)
    const artist = await fetchArtist(accessToken, artistId);

    if (!artist || artist.error) {
        buttons.getArtist.disabled = false;
        buttons.copySongs.disabled = true;
        buttons.saveToPlaylist.disabled = true;
        headings.title.innerText = `Failed to fetch artist for id '${artistId}'`
        headings.subtitle.innerText = '';
        return;
    }

    // update ui
    buttons.getArtist.disabled = true;
    buttons.copySongs.disabled = true;
    buttons.saveToPlaylist.disabled = true;
    headings.title.innerText = `Fetching tracks for ${artist.name}`

    // get albums
    headings.subtitle.innerText = `Fetching albums...`;
    console.log(`- fetching albums for ${artist.name}:`)
    const albums = await fetchArtistAlbums(accessToken, artist.id);
    if (!albums || !albums[0]) {
        buttons.getArtist.disabled = false;
        buttons.copySongs.disabled = true;
        buttons.saveToPlaylist.disabled = true;
        headings.title.innerText = `Failed to fetch albums for ${artist.name}`
        headings.subtitle.innerText = '';
        return;
    }

    // get tracks
    let tracks = new Array<Track>
    for (let i = 0; i < albums.length ; i++) {
        const album = albums[i];
        
        console.log(`  - Fetching (${i + 1}/${albums.length}) album (${album.name}) Tracks`)
        headings.subtitle.innerText = `Fetching tracks from album ${i + 1}/${albums.length}...`;
        tracks = tracks.concat(await fetchAlbumTracks(accessToken, album.id))
    }
    
    // only tracks that include artist
    headings.subtitle.innerText = `Processing tracks...`;
    tracks = tracks.filter(x => x.artists.map(y => y.id).includes(artist.id)); 
    
    // enrich track info
    headings.subtitle.innerText = `Getting more track info...`;
    const chunkSize = 50;
    let newTracks = new Array<Track>;
    for (let i = 0; i < tracks.length; i += chunkSize) {
        const trackChunk = tracks.slice(i, i + chunkSize);
        
        newTracks = newTracks.concat(await completeSongInfo(accessToken, trackChunk));
    }
    const newTrackIds = newTracks.map(x => x.id);
    tracks = tracks
    .filter(x => !newTrackIds.includes(x.id)) // remove old
    .concat(newTracks); // add new
    
    // remove duplicates    
    headings.subtitle.innerText = `Removing duplicate tracks...`;
    tracks = getUniqueTracks(tracks)

    // order by descending?
    if (confirm(`Would you like to order your tracks by popularity?`)) {
        tracks = tracks.sort((a, b) => b.popularity - a.popularity);
    }
    
    // no tracks
    if (!tracks || tracks.length < 1) {
        buttons.getArtist.disabled = false;
        buttons.copySongs.disabled = true;
        buttons.saveToPlaylist.disabled = true;
        headings.title.innerText = `Failed to fetch tracks for ${artist.name}`
        headings.subtitle.innerText = '';
        return;
    }
    
    // done, enable buttons and set text
    headings.title.innerText = `Fetched tracks for ${artist.name}`
    headings.subtitle.innerText = `Fetched ${tracks.length} tracks`;  

    buttons.copySongs.disabled = false;
    buttons.copySongs.addEventListener("click", () => {
        navigator.clipboard.writeText(tracks.map(x => x.external_urls.spotify).join('\n'))
            .then(() => {
                console.log("Spotify links copied to clipboard!")
                buttons.copySongs.disabled = true;
            })
            .catch(err => console.error("Failed to copy text: ", err));
    });
    buttons.saveToPlaylist.disabled = false;
    buttons.saveToPlaylist.addEventListener("click", () => {
        buttons.saveToPlaylist.disabled = true;
        saveToPlaylist(accessToken, `ALL of ${artist.name}`, tracks, profile)
            .then(playlist => {
                console.log('playlist result', playlist)
                // complete and songs added
                if (!playlist.error) {
                    headings.subtitle.innerText = `Tracks saved to playlist: `;
                    let link = document.createElement('a');
                    link.href = playlist.uri;
                    link.innerText = playlist.name;
                    headings.subtitle.appendChild(link)
                } 
                // playlist was created but no(t all) songs added
                else if (playlist.error.hasOwnProperty('playlistCreated')) {
                    headings.subtitle.innerText = `<a href="${playlist.external_urls.spotify}">Playlist</a> created but no(t all) songs were added`;
                } 
                // failed to create playlist
                else {
                    headings.subtitle.innerText = `Playlist failed to create, try again`;
                    buttons.saveToPlaylist.disabled = false;
                }
            })
            .catch(err => console.error("Failed to copy text: ", err));
    });    
}

async function saveToPlaylist(code: string, title: string, tracks: Array<Track>, user: UserProfile): Promise<Playlist> {
    // alert("Sorry, this feature has not yet been implemented. Instead use the 'Click to copy tracks' and paste into your playlist on desktop.")
    // return;

    let playlist = await createPlaylist(code, title, user.id)
    if (playlist.error) {
        return playlist;
    }
    
    const chunkSize = 100;
    const results = new Array<Object>;
    for (let i = 0; i < tracks.length; i += chunkSize) {
        const uriChunk = tracks.slice(i, i + chunkSize).map(x => x.uri);

        results.push(await addSongsToPlaylist(code, playlist.id, uriChunk));
    }
    
    const failedChunks = results.filter(x => x.hasOwnProperty('error'));
    if (failedChunks.length > 0) {
        playlist.error = { playlistCreated: true, message: `${failedChunks.length} chunks (max: ${chunkSize}) of tracks failed to be added to playlist`, failedChunks: failedChunks };
    }
    return playlist
}

async function completeSongInfo(code: string, tracks: Array<Track>): Promise<Array<Track>> {
    const result = await fetch(`https://api.spotify.com/v1/tracks?ids=${tracks.map(x => x.id).join(',')}`, {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    let resultJson = await result.json();
    if (resultJson.error) {
        return [ resultJson ];
    }
    return resultJson.tracks;
}

async function createPlaylist(code: string, title: string, userId: string): Promise<Playlist> {
    const result = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: "POST", 
        headers: { Authorization: `Bearer ${code}` }, 
        body: JSON.stringify({
			name: title,
            description: "Made using Lars's spotify helper",
            public: false
		}) 
    });
    let resultJson = await result.json();
    if (resultJson.error) {
        return resultJson;
    }
    return resultJson as Playlist;
}

async function addSongsToPlaylist(code: string, playlistId: string, uris: Array<string>): Promise<object> {
    const result = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "POST", 
        headers: { Authorization: `Bearer ${code}` }, 
        body: JSON.stringify({
			uris: uris
		}) 
    });
    let resultJson = await result.json();
    if (resultJson.error) {
        return resultJson;
    }
    return { success: `Added ${uris.length} items to playlist` };
}

// this fetches information about the profile of the user that is using the app
async function fetchProfile(code: string): Promise<UserProfile> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    return await result.json();
}

// this fetches information about a spotify artist using their id 
async function fetchArtist(code: string, artistId: string): Promise<Artist> {
    let url = `https://api.spotify.com/v1/artists/${artistId}`
    const result = await fetch(url, {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    let resultJson = await result.json();
    return resultJson
}

// this fetches all the albums that for an artist using their id 
async function fetchArtistAlbums(code: string, artistId: string): Promise<Array<Album>> {
    let url = `https://api.spotify.com/v1/artists/${artistId}/albums?limit=50`
    let albums = new Array<Album>
    while (true) {
        const result = await fetch(url, {
            method: "GET", headers: { Authorization: `Bearer ${code}` }
        });
        let resultJson = await result.json();
        albums = albums.concat(resultJson.items)

        if (resultJson.next) {
            url = resultJson.next
        } 
        else {
            return albums
        }
    }
}

// this fetches all the tracks that for an album using its id 
async function fetchAlbumTracks(code: string, albumId: string): Promise<Array<Track>> {
    let url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`
    let tracks = new Array<Track>
    while (true) {
        const result = await fetch(url, {
            method: "GET", headers: { Authorization: `Bearer ${code}` }
        });
        let resultJson = await result.json();
        tracks = tracks.concat(resultJson.items)

        if (resultJson.next) {
            url = resultJson.next
        } 
        else {
            return tracks
        }
    }
}

function getUniqueTracks(tracks: Track[]): Track[] {
    return Object.values(tracks.reduce((r, v) => {
        const key = `${v.external_ids.isrc}-${v.name}-${v.duration_ms}`;
        if (!r[key] || r[key].popularity < v.popularity) {
            r[key] = v;
        }
        return r;
    }, {}));
}

function extractArtistId(input: string | null): string | null {
    if (!input) {
        return input
    }

    const spotifyUrlPattern = /https:\/\/open\.spotify\.com\/artist\/([a-zA-Z0-9]+)/;
    const match = input.match(spotifyUrlPattern);

    // if it is a spotify artist url, then return the first argument after
    if (match) {
        return match[1];
    } 

    // if it is an artist id, return it
    if (/^[a-zA-Z0-9]+$/.test(input)) {
        return input;
    }

    return null;
}

function populateUI(profile: UserProfile, accessToken: any) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    document.getElementById("avatar")!.setAttribute("src", profile.images[0].url)
    document.getElementById("get-artist")!.addEventListener("click", () => getSongs(accessToken));
}
