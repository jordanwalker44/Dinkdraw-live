'use client';

import { useEffect, useRef, useState } from 'react';

type LocationAutocompleteProps = {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

type GooglePlace = {
  displayName?: string;
  formattedAddress?: string;
  fetchFields: (options: { fields: string[] }) => Promise<void>;
};

type PlacePrediction = {
  text: { toString: () => string };
  toPlace: () => GooglePlace;
};

type AutocompleteSuggestionResult = {
  placePrediction?: PlacePrediction;
};

type PlacesDataLibrary = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      sessionToken: object;
      includedRegionCodes: string[];
    }) => Promise<{ suggestions: AutocompleteSuggestionResult[] }>;
  };
};

declare global {
  interface Window {
    __dinkdrawGoogleMapsReady?: () => void;
    google?: {
      maps: {
        importLibrary?: (libraryName: string) => Promise<PlacesDataLibrary>;
        places?: Partial<PlacesDataLibrary>;
      };
    };
  }
}

let googleMapsLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps?.places?.AutocompleteSuggestion) {
    return Promise.resolve();
  }

  if (googleMapsLoader) {
    return googleMapsLoader;
  }

  googleMapsLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-dinkdraw-google-maps]'
    );

    if (existingScript && window.google?.maps) {
      resolve();
      return;
    }

    window.__dinkdrawGoogleMapsReady = () => {
      delete window.__dinkdrawGoogleMapsReady;
      resolve();
    };

    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Google Maps failed to load.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.dataset.dinkdrawGoogleMaps = 'true';
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      '&libraries=places&v=weekly&callback=__dinkdrawGoogleMapsReady';
    script.async = true;
    script.onerror = () => {
      delete window.__dinkdrawGoogleMapsReady;
      reject(new Error('Google Maps failed to load.'));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}

export function LocationAutocomplete({
  id,
  value,
  onChange,
  required = false,
  invalid = false,
  describedBy,
}: LocationAutocompleteProps) {
  const placesLibraryRef = useRef<PlacesDataLibrary | null>(null);
  const sessionTokenRef = useRef<object | null>(null);
  const requestNumberRef = useRef(0);
  const selectedValueRef = useRef('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    let isCancelled = false;

    if (!apiKey) {
      setMessage('Google venue search is unavailable. Manual entry still works.');
      return;
    }

    async function initializePlaces() {
      try {
        await loadGoogleMaps(apiKey as string);
        if (isCancelled || !window.google) return;

        let library: PlacesDataLibrary | null = null;
        const directPlaces = window.google.maps.places;

        if (
          directPlaces?.AutocompleteSuggestion &&
          directPlaces.AutocompleteSessionToken
        ) {
          library = directPlaces as PlacesDataLibrary;
        } else if (window.google.maps.importLibrary) {
          library = await window.google.maps.importLibrary('places');
        }

        if (
          !library?.AutocompleteSuggestion ||
          !library.AutocompleteSessionToken
        ) {
          throw new Error('Google Places Autocomplete Data API is unavailable.');
        }

        placesLibraryRef.current = library;
        sessionTokenRef.current = new library.AutocompleteSessionToken();
        setIsReady(true);
      } catch (error) {
        console.error(error);
        const detail =
          process.env.NODE_ENV === 'development'
            ? ` (${error instanceof Error ? error.message : String(error)})`
            : '';
        if (!isCancelled) {
          setMessage(`Google venue search could not load.${detail}`);
        }
      }
    }

    initializePlaces();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const library = placesLibraryRef.current;
    const sessionToken = sessionTokenRef.current;
    const searchText = value.trim();

    if (searchText && searchText === selectedValueRef.current) {
      setSuggestions([]);
      return;
    }

    if (!isReady || !library || !sessionToken || searchText.length < 3) {
      setSuggestions([]);
      return;
    }

    const requestNumber = ++requestNumberRef.current;
    const timeout = window.setTimeout(async () => {
      try {
        const response =
          await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: searchText,
            sessionToken,
            includedRegionCodes: ['us'],
          });

        if (requestNumber !== requestNumberRef.current) return;

        setSuggestions(
          response.suggestions
            .map((suggestion) => suggestion.placePrediction)
            .filter((prediction): prediction is PlacePrediction => Boolean(prediction))
            .slice(0, 5)
        );
        setMessage('');
      } catch (error) {
        console.error(error);
        if (requestNumber !== requestNumberRef.current) return;

        const detail =
          process.env.NODE_ENV === 'development'
            ? ` (${error instanceof Error ? error.message : String(error)})`
            : '';
        setSuggestions([]);
        setMessage(`Google could not return venue suggestions.${detail}`);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [isReady, value]);

  async function selectPrediction(prediction: PlacePrediction) {
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress'],
      });

      const name = place.displayName?.trim() || '';
      const address = place.formattedAddress?.trim() || '';
      const selectedLocation =
        name && address && !address.toLowerCase().includes(name.toLowerCase())
          ? `${name} — ${address}`
          : address || name || prediction.text.toString();

      requestNumberRef.current += 1;
      selectedValueRef.current = selectedLocation;
      onChange(selectedLocation);
      setSuggestions([]);

      const library = placesLibraryRef.current;
      if (library) {
        sessionTokenRef.current = new library.AutocompleteSessionToken();
      }
    } catch (error) {
      console.error(error);
      const detail =
        process.env.NODE_ENV === 'development'
          ? ` (${error instanceof Error ? error.message : String(error)})`
          : '';
      setMessage(`Google could not select that venue.${detail}`);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className="input"
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => {
          selectedValueRef.current = '';
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setSuggestions([]);
        }}
        placeholder="Search for a venue, park, or address"
        autoComplete="off"
      />

      {suggestions.length > 0 ? (
        <div
          style={{
            marginTop: 6,
            overflow: 'hidden',
            border: '1px solid rgba(255,203,5,0.3)',
            borderRadius: 14,
            background: '#001428',
            boxShadow: '0 14px 30px rgba(0,0,0,0.32)',
          }}
        >
          {suggestions.map((prediction, index) => (
            <button
              key={`${prediction.text.toString()}-${index}`}
              type="button"
              onClick={() => selectPrediction(prediction)}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 14px',
                border: 0,
                borderBottom:
                  index < suggestions.length - 1
                    ? '1px solid rgba(255,255,255,0.08)'
                    : 0,
                background: '#001428',
                color: '#ffffff',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {prediction.text.toString()}
            </button>
          ))}
          <div
            style={{
              padding: '7px 14px',
              color: 'rgba(255,255,255,0.58)',
              fontSize: 11,
              textAlign: 'right',
            }}
          >
            Powered by Google
          </div>
        </div>
      ) : null}

      {message ? (
        <div style={{ color: '#ffcf70', fontSize: 12, marginTop: 7 }}>
          {message} You can still type the location manually.
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Type at least 3 characters, then choose a Google suggestion or keep your
          manual entry.
        </div>
      )}
    </div>
  );
}
