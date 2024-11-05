// Because this is a literal single page application
// we detect a callback from Spotify by checking for the hash fragment
import { redirectToAuthCodeFlow, getAccessToken } from "./authCodeWithPkce";

const clientId = "466e28d7d351498fbed7af441e08dcb7";
const params = new URLSearchParams(window.location.search);
const code = params.get("code");

if (!code) {
    redirectToAuthCodeFlow(clientId);
} else {
    let profile, accessToken;
    while (true) {
        accessToken = await getAccessToken(clientId, code);
        profile = await fetchProfile(accessToken);
        if (profile.error) {
            redirectToAuthCodeFlow(clientId);
        } else {
            break;
        }
    }

    populateUI(profile, accessToken);
}

async function getSongs(accessToken: any) {
    console.log('get songs:')
    console.log('- fetching albums:')

    let albumElement = document.getElementById("albums")! as HTMLButtonElement;
    albumElement.innerText = `Fetching all albums`;
    albumElement.disabled = true;

    const id = prompt("artist id")
    const albums = await fetchArtistAlbums(accessToken, id);
    let tracks = new Array<Track>
    for (let i = 0; i < albums.length ; i++) {
        const album = albums[i];
        
        console.log(`  - Fetching (${i + 1}/${albums.length}) album (${album.name}) Tracks`)
        albumElement.innerText = `Fetching tracks from album ${i + 1}/${albums.length}`;
        tracks = tracks.concat(await fetchAlbumTracks(accessToken, album.id))
    }
    albumElement.innerText = `Click to copy tracks`;
    albumElement.disabled = false;
    albumElement.addEventListener("click", () => {
        navigator.clipboard.writeText(tracks.map(x => x.external_urls.spotify).join('\n'))
            .then(() => console.log("Spotify links copied to clipboard!"))
            .catch(err => console.error("Failed to copy text: ", err));
    });
}

async function fetchProfile(code: string): Promise<UserProfile> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${code}` }
    });
    return await result.json();
}

async function fetchArtistAlbums(code: string, id: string): Promise<Array<Album>> {
    let url = `https://api.spotify.com/v1/artists/${id}/albums`
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

async function fetchAlbumTracks(code: string, id: string): Promise<Array<Track>> {
    let url = `https://api.spotify.com/v1/albums/${id}/tracks`
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
    document.getElementById("get-songs")!.addEventListener("click", () => getSongs(accessToken));
}
