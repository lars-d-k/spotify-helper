// Because this is a literal single page application
// we detect a callback from Spotify by checking for the hash fragment
import { redirectToAuthCodeFlow, getAccessToken } from "./authCodeWithPkce";

const clientId = "905dd5f352484d81a65a690fe3f0b4e6";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

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
}

async function getSongs(accessToken: any) {
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

    // get artist
    const artistId = prompt("artist id") ?? ""
    console.log('fetching artist:')
    const artist = await fetchArtist(accessToken, artistId);
    if (artist.error) {
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
    if (!albums || albums.length < 1) {
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
    tracks = tracks.filter(x => x.artists.map(x => x.id).includes(artist.id));    

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
    buttons.copySongs.disabled = false;
    buttons.copySongs.addEventListener("click", () => {
        navigator.clipboard.writeText(tracks.map(x => x.external_urls.spotify).join('\n'))
            .then(() => console.log("Spotify links copied to clipboard!"))
            .catch(err => console.error("Failed to copy text: ", err));
    });
    buttons.saveToPlaylist.disabled = false;
    buttons.saveToPlaylist.addEventListener("click", () => {
        saveToPlaylist(accessToken, `ALL of ${artist.name}`, tracks, profile)
            .then(() => console.log("Spotify playlist saved!"))
            .catch(err => console.error("Failed to copy text: ", err));

    buttons.saveToPlaylist.disabled = false;
    headings.title.innerText = `Fetched tracks for ${artist.name}`
    headings.subtitle.innerText = '';
    });    
}

async function saveToPlaylist(code: string, title: string, tracks: Array<Track>, user: UserProfile) {
    alert("Sorry, this feature has not yet been implemented. Instead use the 'Click to copy tracks' and paste into your playlist on desktop.")
    return;

    const result = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
        method: "POST", 
        headers: { Authorization: `Bearer ${code}` }, 
        body: JSON.stringify({
			name: title,
            description: "Made using Lars's spotify helper",
            public: false
		}) 
    });
    let resultJson = await result.json();
    if (!resultJson.error) {
        console.log(resultJson)
    } else {
        console.log('error', resultJson.error)
    }
}

async function fetchProfile(code: string): Promise<UserProfile> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    return await result.json();
}

async function fetchArtist(code: string, artistId: string): Promise<Artist> {
    let url = `https://api.spotify.com/v1/artists/${artistId}`
    const result = await fetch(url, {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    let resultJson = await result.json();
    return resultJson
}

async function fetchArtistAlbums(code: string, artistId: string): Promise<Array<Album>> {
    let url = `https://api.spotify.com/v1/artists/${artistId}/albums`
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

async function fetchAlbumTracks(code: string, albumId: string): Promise<Array<Track>> {
    let url = `https://api.spotify.com/v1/albums/${albumId}/tracks`
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

function populateUI(profile: UserProfile, accessToken: any) {
    document.getElementById("displayName")!.innerText = profile.display_name;
    document.getElementById("avatar")!.setAttribute("src", profile.images[0].url)
    document.getElementById("get-artist")!.addEventListener("click", () => getSongs(accessToken));
}
