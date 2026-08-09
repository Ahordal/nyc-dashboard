// fixtures.mjs
// Real LocationIQ responses captured earlier during manual testing.
// Used as regression fixtures so scoring logic can be verified without
// hitting the live API (saves quota, is deterministic, runs in CI).

export const kitchen79 = {
  input: {
    dba: 'Kitchen 79',
    building: '37-70',
    street: '79 Street',
    boro: 'Queens',
    zip: '11372',
    dohmhLat: 40.749079,
    dohmhLon: -73.887042,
  },
  hyphenatedResults: [
    {
      lat: '40.682982',
      lon: '-73.806534',
      display_name:
        "Kam's Kitchen, 111-56, Van Wyck Expressway Service Road West;Van Wyck Expressway, Richmond Hill, Queens, New York, Queens County, New York, 11420, USA",
      address: {
        name: "Kam's Kitchen",
        house_number: '111-56',
        road: 'Van Wyck Expressway Service Road West;Van Wyck Expressway',
        suburb: 'Queens',
        postcode: '11420',
      },
    },
    {
      lat: '40.727764',
      lon: '-73.891972',
      display_name: 'Spice Kitchen, 71-04, Grand Avenue, Maspeth, Queens, New York, Queens County, New York, 11378, USA',
      address: {
        name: 'Spice Kitchen',
        house_number: '71-04',
        road: 'Grand Avenue',
        suburb: 'Queens',
        postcode: '11378',
      },
    },
    {
      lat: '40.735775',
      lon: '-73.880928',
      display_name: 'Asian Kitchen, Elmhurst, Queens, New York, Queens County, New York, 11373, USA',
      address: {
        name: 'Asian Kitchen',
        suburb: 'Queens',
        postcode: '11373',
      },
    },
    {
      lat: '40.720688',
      lon: '-73.904372',
      display_name: '888 Kitchen, 60-92, Flushing Avenue, Maspeth, Queens, New York, Queens County, New York, 11378, USA',
      address: {
        name: '888 Kitchen',
        house_number: '60-92',
        road: 'Flushing Avenue',
        suburb: 'Queens',
        postcode: '11378',
      },
    },
    {
      lat: '40.747562',
      lon: '-73.886898',
      display_name:
        'Kitchen 79, 3770, 79th Street, Jackson Heights, Queens, New York, Queens County, New York, 11372, USA',
      address: {
        name: 'Kitchen 79',
        house_number: '3770',
        road: '79th Street',
        neighbourhood: 'Jackson Heights',
        suburb: 'Queens',
        postcode: '11372',
      },
    },
  ],
  noHyphenResults: [
    {
      lat: '40.747562',
      lon: '-73.886898',
      display_name:
        'Kitchen 79, 3770, 79th Street, Jackson Heights, Queens, New York, Queens County, New York, 11372, USA',
      address: {
        name: 'Kitchen 79',
        house_number: '3770',
        road: '79th Street',
        neighbourhood: 'Jackson Heights',
        suburb: 'Queens',
        postcode: '11372',
      },
    },
  ],
};

export const buffaloWildWingsGo = {
  input: {
    dba: 'Buffalo Wild Wings Go',
    building: '79-23',
    street: 'Main Street',
    boro: 'Queens',
    zip: '11367',
    // Real DOHMH coordinate wasn't captured during manual testing — using the
    // confirmed-correct Google location as a stand-in so the distance check
    // still exercises realistically. Replace with the actual DOHMH value
    // when wiring real data through this path.
    dohmhLat: 40.7183086,
    dohmhLon: -73.8167019,
  },
  hyphenatedResults: [
    {
      lat: '40.712801',
      lon: '-73.783903',
      display_name:
        'Buffalo Wild Wings Go, 179-19, Hillside Avenue, Jamaica Estates, Queens, New York, Queens County, New York, 11432, USA',
      address: {
        name: 'Buffalo Wild Wings Go',
        house_number: '179-19',
        road: 'Hillside Avenue',
        neighbourhood: 'Jamaica Estates',
        suburb: 'Queens',
        postcode: '11432',
      },
    },
  ],
  noHyphenResults: [
    {
      lat: '40.712801',
      lon: '-73.783903',
      display_name:
        'Buffalo Wild Wings Go, 179-19, Hillside Avenue, Jamaica Estates, Queens, New York, Queens County, New York, 11432, USA',
      address: {
        name: 'Buffalo Wild Wings Go',
        house_number: '179-19',
        road: 'Hillside Avenue',
        neighbourhood: 'Jamaica Estates',
        suburb: 'Queens',
        postcode: '11432',
      },
    },
  ],
};

export const xinXing88 = {
  input: {
    dba: 'Xin Xing 88 Chinese Restaurant',
    building: '188-13',
    street: 'Jamaica Avenue',
    boro: 'Queens',
    zip: '11423',
    // Same caveat as above — stand-in DOHMH coordinate from confirmed Google location.
    dohmhLat: 40.7112702,
    dohmhLon: -73.7705501,
  },
  hyphenatedResults: [
    {
      lat: '40.711196',
      lon: '-73.770485',
      display_name: '188-13, Jamaica Avenue, Hollis, Queens, New York, Queens County, New York, 11423, USA',
      address: {
        house_number: '188-13',
        road: 'Jamaica Avenue',
        neighbourhood: 'Hollis',
        suburb: 'Queens',
        postcode: '11423',
      },
    },
  ],
  noHyphenResults: [
    {
      lat: '40.7221721',
      lon: '-73.730165',
      display_name: '18813, Jamaica Avenue, Queens Village, Queens, New York, Queens County, New York, 11001, USA',
      address: {
        house_number: '18813',
        road: 'Jamaica Avenue',
        neighbourhood: 'Queens Village',
        suburb: 'Queens',
        postcode: '11001',
      },
    },
    {
      lat: '40.7221721',
      lon: '-73.730165',
      display_name: '18813, Jamaica Avenue, Bellerose, Queens, New York, Queens County, New York, 11001, USA',
      address: {
        house_number: '18813',
        road: 'Jamaica Avenue',
        neighbourhood: 'Bellerose',
        suburb: 'Queens',
        postcode: '11001',
      },
    },
    {
      lat: '40.711348',
      lon: '-73.769976',
      display_name: 'Jamaica Avenue, Hollis, Queens, New York, Queens County, New York, 11423, USA',
      address: {
        road: 'Jamaica Avenue',
        neighbourhood: 'Hollis',
        suburb: 'Queens',
        postcode: '11423',
      },
    },
    {
      lat: '40.716191',
      lon: '-73.744836',
      display_name: 'Jamaica Avenue, Queens Village, Queens, New York, Queens County, New York, 11428, USA',
      address: {
        road: 'Jamaica Avenue',
        neighbourhood: 'Queens Village',
        suburb: 'Queens',
        postcode: '11428',
      },
    },
    {
      lat: '40.726456',
      lon: '-73.716056',
      display_name: 'Jamaica Avenue, Bellerose, Queens, New York, Queens County, New York, 11426, USA',
      address: {
        road: 'Jamaica Avenue',
        neighbourhood: 'Bellerose',
        suburb: 'Queens',
        postcode: '11426',
      },
    },
  ],
};
