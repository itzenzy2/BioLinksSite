const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID; // MODIFIED

const getAccessToken = async () => {
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    return data.access_token;
};

const fetchAllTracks = async (playlistId, accessToken) => {
    let tracks = [];
    // Request the preview_url field for each track
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(name,artists(name),album(images),preview_url)),next&limit=100`;
    
    while (url) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error(`Spotify API request failed (tracks): ${response.statusText}`);
        }
        const data = await response.json();
        // Filter out any items where the track object is null
        const validItems = data.items.filter(item => item.track);
        tracks = tracks.concat(validItems);
        url = data.next;
    }
    return tracks;
};

exports.handler = async function(event, context) {
    if (!client_id || !client_secret || !PLAYLIST_ID) { // Added check for PLAYLIST_ID
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: Spotify credentials or Playlist ID missing.' })
        };
    }

    try {
        const accessToken = await getAccessToken();

        const playlistInfoResponse = await fetch(`https://api.spotify.com/v1/playlists/${PLAYLIST_ID}?fields=name,owner.display_name,images`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!playlistInfoResponse.ok) {
            throw new Error(`Spotify API request failed (playlist info): ${playlistInfoResponse.statusText}`);
        }
        const playlistData = await playlistInfoResponse.json();

        const allTracks = await fetchAllTracks(PLAYLIST_ID, accessToken);

        const formattedData = {
            name: playlistData.name,
            creator: playlistData.owner.display_name,
            playlistArtUrl: playlistData.images[0]?.url || '',
            tracks: allTracks.map(item => ({
                name: item.track.name,
                artist: item.track.artists.map(artist => artist.name).join(', '),
                albumArtUrl: item.track.album.images[0]?.url || '',
                // Add the previewUrl to the response
                previewUrl: item.track.preview_url || null
            }))
        };

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 's-maxage=3600, stale-while-revalidate'
            },
            body: JSON.stringify(formattedData)
        };

    } catch (error) {
        console.error('Error in Spotify function:', error, error.stack);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message, stack: error.stack })
        };
    }
};