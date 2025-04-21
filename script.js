// Delivery Robot App JavaScript with Leaflet and OpenStreetMap

// DOM Elements
const stopBtn = document.getElementById('stopBtn');
const robotLocationBtn = document.getElementById('robotLocationBtn');
const pickupBtn = document.getElementById('pickupBtn');
const dropBtn = document.getElementById('dropBtn');
const locationInputContainer = document.getElementById('locationInputContainer');
const locationInput = document.getElementById('locationInput');
const searchResultsContainer = document.getElementById('search-results');
const confirmLocationBtn = document.getElementById('confirmLocationBtn');
const cancelLocationBtn = document.getElementById('cancelLocationBtn');
const statusText = document.getElementById('statusText');

// App State
let map;
let currentAction = null; // 'pickup' or 'drop'
let robotLocation = null; // Robot location will be set based on user's pickup location
let pickupLocation = null;
let dropLocation = null;
let robotMarker;
let pickupMarker;
let dropMarker;
let routeControl;
let searchProvider;
let searchResults = [];

// Initialize Leaflet map
function initMap() {
    console.log('Initializing map...');
    
    try {
        // Default to a central location that will be updated
        let initialLocation = [0, 0];
        let initialZoom = 2;
        
        // Create the map with a default center that will be updated
        map = L.map('map').setView(initialLocation, initialZoom);
        
        // Try to get user's location for better initial positioning
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Update map center to user's current location
                    const userLocation = [position.coords.latitude, position.coords.longitude];
                    map.setView(userLocation, 13);
                    console.log('Map centered on user location');
                },
                (error) => {
                    console.warn('Geolocation error:', error.message);
                    // If geolocation fails, keep the default world view
                }
            );
        }
        
        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
        
        console.log('Map object created');
        
        // Initialize search provider (Nominatim)
        initSearch();
        
        updateStatus('App initialized. Ready for delivery instructions.');
    } catch (err) {
        console.error('Error creating map:', err);
        updateStatus('Could not initialize map: ' + err.message, 'error');
    }
}

// Add robot marker to the map
function addRobotMarker() {
    // Create a custom icon for the robot
    const robotIcon = L.divIcon({
        className: 'robot-marker',
        html: '<div style="width: 20px; height: 20px; border-radius: 50%; background-color: #bc13fe; border: 2px solid white; box-shadow: 0 0 10px #bc13fe;"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    
    // Add the marker to the map at the pickup location
    if (pickupLocation) {
        robotLocation = pickupLocation;
        robotMarker = L.marker(robotLocation, {icon: robotIcon}).addTo(map);
        robotMarker.bindPopup("Robot Location");
    }
}

// Initialize the search functionality
function initSearch() {
    // Use Nominatim for geocoding
    searchProvider = new GeoSearch.OpenStreetMapProvider();
    
    // Set up the input event listener
    locationInput.addEventListener('input', debounce(async function() {
        const query = locationInput.value.trim();
        if (query.length < 3) {
            searchResultsContainer.innerHTML = '';
            return;
        }
        
        try {
            const results = await searchProvider.search({ query });
            searchResults = results;
            displaySearchResults(results);
        } catch (err) {
            console.error('Search error:', err);
        }
    }, 500));
}

// Display search results
function displaySearchResults(results) {
    searchResultsContainer.innerHTML = '';
    
    if (results.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'search-result';
        noResults.textContent = 'No results found';
        searchResultsContainer.appendChild(noResults);
        return;
    }
    
    results.slice(0, 5).forEach((result, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'search-result';
        resultItem.textContent = result.label;
        resultItem.addEventListener('click', () => {
            handleLocationSelect(result);
        });
        searchResultsContainer.appendChild(resultItem);
    });
}

// Handle location selection
function handleLocationSelect(result) {
    const coordinates = [result.y, result.x]; // [lat, lng]
    const placeName = result.label;
    
    if (currentAction === 'pickup') {
        // If previous marker exists, remove it
        if (pickupMarker) {
            map.removeLayer(pickupMarker);
        }
        
        // Store pickup location
        pickupLocation = coordinates;
        
        // Create pickup marker
        const pickupIcon = L.divIcon({
            className: 'pickup-marker',
            html: '<div style="width: 16px; height: 16px; border-radius: 50%; background-color: #00ffff; border: 2px solid white; box-shadow: 0 0 10px #00ffff;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        pickupMarker = L.marker(pickupLocation, {icon: pickupIcon}).addTo(map);
        pickupMarker.bindPopup("Pickup Location");
        
        // Also set robot location to pickup location and add/update robot marker
        robotLocation = pickupLocation;
        
        // Remove existing robot marker if it exists
        if (robotMarker) {
            map.removeLayer(robotMarker);
        }
        
        // Add robot marker at pickup location
        addRobotMarker();
        
        // Update button text
        pickupBtn.textContent = `YOUR LOCATION: ${shortenAddress(placeName)}`;
        updateStatus('Pickup location set!', 'success');
    } else if (currentAction === 'drop') {
        // If previous marker exists, remove it
        if (dropMarker) {
            map.removeLayer(dropMarker);
        }
        
        // Store drop location
        dropLocation = coordinates;
        
        // Create drop marker
        const dropIcon = L.divIcon({
            className: 'drop-marker',
            html: '<div style="width: 16px; height: 16px; border-radius: 50%; background-color: #39ff14; border: 2px solid white; box-shadow: 0 0 10px #39ff14;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        dropMarker = L.marker(dropLocation, {icon: dropIcon}).addTo(map);
        dropMarker.bindPopup("Drop Location");
        
        // Update button text
        dropBtn.textContent = `DROP LOCATION: ${shortenAddress(placeName)}`;
        updateStatus('Drop location set!', 'success');
    }
    
    // Clear search and close location input container
    locationInput.value = '';
    searchResultsContainer.innerHTML = '';
    locationInputContainer.classList.remove('active');
    
    // Update route if both locations are set
    if (pickupLocation && dropLocation) {
        calculateAndDisplayRoute();
    }
}

// Calculate and display the route
function calculateAndDisplayRoute() {
    if (!pickupLocation || !dropLocation) return;
    
    try {
        // Remove existing route if any
        if (routeControl) {
            map.removeControl(routeControl);
        }
        
        // Create a new route - only between pickup and drop locations
        routeControl = L.Routing.control({
            waypoints: [
                L.latLng(pickupLocation[0], pickupLocation[1]),
                L.latLng(dropLocation[0], dropLocation[1])
            ],
            routeWhileDragging: false,
            showAlternatives: false,
            fitSelectedRoutes: true,
            lineOptions: {
                styles: [
                    {color: '#00ffff', opacity: 0.7, weight: 5}
                ]
            },
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'driving'
            })
        }).addTo(map);
        
        // Hide the detailed instructions
        routeControl.hide();
        
        // Move robot to pickup location initially
        robotLocation = pickupLocation;
        robotMarker.setLatLng(robotLocation);
        
        updateStatus('Route calculated! Robot is ready for delivery.', 'success');
    } catch (err) {
        console.error('Error calculating route:', err);
        updateStatus('Could not calculate route: ' + err.message, 'error');
    }
}

// Update status text
function updateStatus(message, type = 'info') {
    statusText.textContent = message;
    console.log(`Status [${type}]: ${message}`);
    
    // Visual feedback based on status type
    statusText.style.color = type === 'error' ? '#ff0044' : 
                            type === 'success' ? '#39ff14' : 
                            'rgba(255, 255, 255, 0.8)';
}

// Helper function to shorten address for buttons
function shortenAddress(address) {
    if (!address) return '';
    // Split address and take first part
    const parts = address.split(',');
    return parts[0].length > 20 ? parts[0].substring(0, 17) + '...' : parts[0];
}

// Add bouncing animation to robot marker
function animateRobotMarker(durationMs = 2000) {
    if (!robotMarker) return;
    
    const el = robotMarker.getElement();
    if (el) {
        el.style.animation = 'bounce 0.5s infinite alternate';
        
        setTimeout(() => {
            el.style.animation = '';
        }, durationMs);
    }
}

// Debounce function for search input
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Simulate robot movement (for demo purposes)
function simulateRobotMovement() {
    if (pickupLocation && dropLocation) {
        updateStatus('Robot is on the move!');
        
        // Robot is already at pickup location, now move to drop
        updateStatus('Robot is moving to drop location');
        
        // Simulate moving to drop location
        setTimeout(() => {
            robotLocation = dropLocation;
            
            // Update marker position
            robotMarker.setLatLng(robotLocation);
            
            updateStatus('Delivery completed!', 'success');
        }, 3000);
    } else {
        updateStatus('Please set pickup and drop locations first', 'error');
    }
}

// Event Listeners
stopBtn.addEventListener('click', () => {
    updateStatus('EMERGENCY STOP ACTIVATED! Robot has stopped.', 'error');
    // Simulate stopping the robot with visual feedback
    animateRobotMarker();
});

robotLocationBtn.addEventListener('click', () => {
    if (!map) {
        updateStatus('Map not loaded yet', 'error');
        return;
    }
    
    if (!robotLocation) {
        updateStatus('Robot location not set. Please select a pickup location first.', 'error');
        return;
    }
    
    map.setView(robotLocation, 15, {
        animate: true,
        duration: 1
    });
    updateStatus('Showing current robot location');
    animateRobotMarker();
});

pickupBtn.addEventListener('click', () => {
    currentAction = 'pickup';
    locationInputContainer.classList.add('active');
    locationInput.value = '';
    searchResultsContainer.innerHTML = '';
    locationInput.focus();
    updateStatus('Enter pickup location');
});

dropBtn.addEventListener('click', () => {
    currentAction = 'drop';
    locationInputContainer.classList.add('active');
    locationInput.value = '';
    searchResultsContainer.innerHTML = '';
    locationInput.focus();
    updateStatus('Enter drop location');
});

confirmLocationBtn.addEventListener('click', () => {
    if (locationInput.value.trim() === '') {
        updateStatus('Please enter a location', 'error');
        return;
    }
    
    // If the search results are available and user hasn't clicked on one yet
    if (searchResults.length > 0) {
        handleLocationSelect(searchResults[0]);
    } else {
        updateStatus('Please select a location from the search results', 'error');
    }
});

cancelLocationBtn.addEventListener('click', () => {
    locationInputContainer.classList.remove('active');
    locationInput.value = '';
    searchResultsContainer.innerHTML = '';
    updateStatus('Location selection cancelled');
});

// Add CSS for markers and animations
const style = document.createElement('style');
style.innerHTML = `
@keyframes bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-10px); }
}

.search-result {
    padding: 8px 12px;
    background-color: rgba(15, 15, 20, 0.9);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    cursor: pointer;
    color: white;
    font-size: 14px;
}

.search-result:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

#search-results {
    max-height: 200px;
    overflow-y: auto;
    width: 100%;
}
`;
document.head.appendChild(style);

// Initialize the map when the window loads
window.onload = function() {
    console.log('Window loaded, initializing map...');
    setTimeout(initMap, 500); // Short delay to ensure DOM is fully ready
}; 