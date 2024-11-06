interface UserProfile {
    country: string;
    display_name: string;
    email: string;
    explicit_content: {
        filter_enabled: boolean,
        filter_locked: boolean
    };
    external_urls: { spotify: string; };
    followers: { href: string; total: number; };
    href: string;
    id: string;
    images: Image[];
    product: string;
    type: string;
    uri: string;
    error?: object;
}

interface Album {
    id: string;
    name: string;
    artists: Array<Artist>;    
    error?: object;
}

interface Artist {
    id: string;
    name: string;
    error?: object;
}

interface Track {
    id: string;
    name: string;
    external_urls: {
        spotify: string;
    }
    uri: string;
    artists: Array<Artist>;    
    error?: object;
}

interface Playlist {
    id: string;
    name: string;
    description: string;
    external_urls: {
        spotify: string;
    }
    uri: string;
    error?: object;
}

interface Image {
    url: string;
    height: number;
    width: number;
}
