// Indian cities: state, centre coordinates, PIN prefix and well known
// commercial localities (used by the demo directory and the objective parser).

export interface City {
  name: string;
  state: string;
  lat: number;
  lng: number;
  pin: string; // first three digits
  localities: string[];
  aliases?: string[];
}

export const CITIES: City[] = [
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777, pin: "400", localities: ["Masjid Bunder", "Dadar", "Andheri East", "Kurla", "Bhiwandi Road", "Vashi APMC", "Goregaon"], aliases: ["bombay"] },
  { name: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209, pin: "110", localities: ["Khari Baoli", "Chandni Chowk", "Naya Bazar", "Azadpur", "Okhla", "Karol Bagh", "Lawrence Road"], aliases: ["new delhi", "dilli"] },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946, pin: "560", localities: ["Chickpet", "Yeshwanthpur", "KR Market", "Peenya", "Jayanagar", "Malleswaram", "Whitefield"], aliases: ["bangalore", "bengaluru"] },
  { name: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867, pin: "500", localities: ["Begum Bazar", "Secunderabad", "Kukatpally", "Dilsukhnagar", "Osmangunj", "Ameerpet"] },
  { name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714, pin: "380", localities: ["Kalupur", "Naroda", "Narol", "Maninagar", "Odhav", "Navrangpura"] },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707, pin: "600", localities: ["Parrys Corner", "Koyambedu", "T Nagar", "Ambattur", "Sowcarpet", "Mylapore"], aliases: ["madras"] },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639, pin: "700", localities: ["Burrabazar", "Posta Bazar", "Howrah", "Salt Lake", "Garia", "Dum Dum"], aliases: ["calcutta"] },
  { name: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567, pin: "411", localities: ["Market Yard", "Bhawani Peth", "Hadapsar", "Pimpri", "Kothrud", "Chinchwad"] },
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873, pin: "302", localities: ["Johari Bazar", "Chandpole", "Sanganer", "Mansarovar", "Vishwakarma Industrial Area", "Malviya Nagar"] },
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462, pin: "226", localities: ["Aminabad", "Chowk", "Alambagh", "Gomti Nagar", "Naka Hindola", "Indira Nagar"] },
  { name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lng: 80.3319, pin: "208", localities: ["Collectorganj", "Naughara", "Kidwai Nagar", "Fazalganj", "Govind Nagar", "Kalyanpur"] },
  { name: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882, pin: "440", localities: ["Itwari", "Sitabuldi", "Gandhibagh", "Wardha Road", "Mahal", "Kalamna Market"] },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577, pin: "452", localities: ["Siyaganj", "Malharganj", "Sanwer Road", "Vijay Nagar", "Palasia", "Chhawni"] },
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lng: 77.4126, pin: "462", localities: ["MP Nagar", "Hamidia Road", "Bairagarh", "Kolar Road", "Govindpura", "Itwara", "Jahangirabad"] },
  { name: "Jabalpur", state: "Madhya Pradesh", lat: 23.1815, lng: 79.9864, pin: "482", localities: ["Bada Fuhara", "Gorakhpur", "Napier Town", "Adhartal", "Ranjhi", "Sadar"] },
  { name: "Gwalior", state: "Madhya Pradesh", lat: 26.2183, lng: 78.1828, pin: "474", localities: ["Lashkar", "Dal Bazar", "Morar", "Thatipur", "City Centre", "Hazira"] },
  { name: "Raipur", state: "Chhattisgarh", lat: 21.2514, lng: 81.6296, pin: "492", localities: ["Ganj Para", "Pandri", "Telibandha", "Bhanpuri", "Station Road", "Shankar Nagar"] },
  { name: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311, pin: "395", localities: ["Ring Road", "Udhna", "Varachha", "Sachin GIDC", "Katargam", "Adajan"] },
  { name: "Vadodara", state: "Gujarat", lat: 22.3072, lng: 73.1812, pin: "390", localities: ["Mandvi", "Makarpura GIDC", "Alkapuri", "Gotri", "Karelibaug", "Sayajigunj"], aliases: ["baroda"] },
  { name: "Rajkot", state: "Gujarat", lat: 22.3039, lng: 70.8022, pin: "360", localities: ["Bedi Marketing Yard", "Gondal Road", "Kalawad Road", "Aji GIDC", "Dhebar Road"] },
  { name: "Nashik", state: "Maharashtra", lat: 19.9975, lng: 73.7898, pin: "422", localities: ["Panchavati", "Satpur MIDC", "Ambad", "Dwarka", "Nashik Road", "College Road"] },
  { name: "Aurangabad", state: "Maharashtra", lat: 19.8762, lng: 75.3433, pin: "431", localities: ["Jalna Road", "Waluj MIDC", "Gulmandi", "Cidco", "Shahganj"], aliases: ["chhatrapati sambhajinagar"] },
  { name: "Patna", state: "Bihar", lat: 25.5941, lng: 85.1376, pin: "800", localities: ["Maruf Ganj", "Bakarganj", "Kankarbagh", "Boring Road", "Patna City", "Danapur"] },
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lng: 85.3096, pin: "834", localities: ["Upper Bazar", "Main Road", "Kokar", "Doranda", "Harmu", "Lalpur"] },
  { name: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245, pin: "751", localities: ["Unit 1 Market", "Rasulgarh", "Saheed Nagar", "Patia", "Mancheswar", "Old Town"] },
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362, pin: "781", localities: ["Fancy Bazar", "Paltan Bazar", "Beltola", "Ganeshguri", "Chandmari", "Athgaon"] },
  { name: "Chandigarh", state: "Chandigarh", lat: 30.7333, lng: 76.7794, pin: "160", localities: ["Sector 26 Grain Market", "Industrial Area Phase 1", "Sector 17", "Manimajra", "Sector 22"] },
  { name: "Ludhiana", state: "Punjab", lat: 30.901, lng: 75.8573, pin: "141", localities: ["Chaura Bazar", "Focal Point", "Gill Road", "Model Town", "Dugri", "Ghumar Mandi"] },
  { name: "Amritsar", state: "Punjab", lat: 31.634, lng: 74.8723, pin: "143", localities: ["Hall Bazar", "Katra Ahluwalia", "Ranjit Avenue", "Majitha Road", "Chheharta"] },
  { name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lng: 78.0322, pin: "248", localities: ["Paltan Bazaar", "Rajpur Road", "Niranjanpur Mandi", "Prem Nagar", "Clement Town"] },
  { name: "Varanasi", state: "Uttar Pradesh", lat: 25.3176, lng: 82.9739, pin: "221", localities: ["Vishweshwarganj", "Lahurabir", "Sigra", "Pandeypur", "Lanka", "Chowk"], aliases: ["banaras", "kashi"] },
  { name: "Agra", state: "Uttar Pradesh", lat: 27.1767, lng: 78.0081, pin: "282", localities: ["Belanganj", "Sanjay Place", "Kamla Nagar", "Sikandra", "Shahganj", "Lohamandi"] },
  { name: "Meerut", state: "Uttar Pradesh", lat: 28.9845, lng: 77.7064, pin: "250", localities: ["Sadar Bazar", "Begum Bridge", "Shastri Nagar", "Partapur", "Abu Lane"] },
  { name: "Prayagraj", state: "Uttar Pradesh", lat: 25.4358, lng: 81.8463, pin: "211", localities: ["Chowk", "Katra", "Civil Lines", "Naini", "Mutthiganj"], aliases: ["allahabad"] },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673, pin: "682", localities: ["Broadway", "Ernakulam North", "Kaloor", "Edappally", "Mattancherry", "Kakkanad"], aliases: ["cochin", "ernakulam"] },
  { name: "Thiruvananthapuram", state: "Kerala", lat: 8.5241, lng: 76.9366, pin: "695", localities: ["Chalai", "Pettah", "Kazhakoottam", "Pattom", "Karamana"], aliases: ["trivandrum"] },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lng: 76.9558, pin: "641", localities: ["Town Hall", "Gandhipuram", "RS Puram", "Peelamedu", "Ukkadam", "Singanallur"] },
  { name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lng: 78.1198, pin: "625", localities: ["East Masi Street", "Keezhavasal", "Anna Nagar", "Simmakkal", "Thirunagar"] },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lng: 83.2185, pin: "530", localities: ["Poorna Market", "Gajuwaka", "Dwaraka Nagar", "MVP Colony", "Akkayyapalem"], aliases: ["vizag"] },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648, pin: "520", localities: ["One Town", "Governorpet", "Benz Circle", "Auto Nagar", "Patamata"] },
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lng: 76.6394, pin: "570", localities: ["Devaraja Market", "Mandi Mohalla", "Hebbal Industrial Area", "Vijayanagar", "Kuvempunagar"], aliases: ["mysore"] },
  { name: "Hubballi", state: "Karnataka", lat: 15.3647, lng: 75.124, pin: "580", localities: ["Durgad Bail", "Gokul Road", "Vidyanagar", "Keshwapur", "Old Hubli"], aliases: ["hubli"] },
  { name: "Udaipur", state: "Rajasthan", lat: 24.5854, lng: 73.7125, pin: "313", localities: ["Bapu Bazar", "Hiran Magri", "Madri Industrial Area", "Sukhadia Circle"] },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lng: 73.0243, pin: "342", localities: ["Sojati Gate", "Basni Industrial Area", "Sardarpura", "Paota", "Mandore Mandi"] },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lng: 75.8648, pin: "324", localities: ["Rampura Bazar", "Talwandi", "Indraprastha Industrial Area", "Gumanpura"] },
  { name: "Ujjain", state: "Madhya Pradesh", lat: 23.1765, lng: 75.7885, pin: "456", localities: ["Freeganj", "Dewas Gate", "Nanakheda", "Maxi Road"] },
  { name: "Bilaspur", state: "Chhattisgarh", lat: 22.0797, lng: 82.1391, pin: "495", localities: ["Gol Bazar", "Vyapar Vihar", "Sarkanda", "Link Road"] },
  { name: "Jamshedpur", state: "Jharkhand", lat: 22.8046, lng: 86.2029, pin: "831", localities: ["Sakchi", "Bistupur", "Adityapur", "Jugsalai", "Golmuri"] },
  { name: "Cuttack", state: "Odisha", lat: 20.4625, lng: 85.8828, pin: "753", localities: ["Chandni Chowk", "Buxi Bazar", "College Square", "Jagatpur"] },
  { name: "Siliguri", state: "West Bengal", lat: 26.7271, lng: 88.3953, pin: "734", localities: ["Bidhan Market", "Sevoke Road", "Hill Cart Road", "Pradhan Nagar"] },
  { name: "Gorakhpur", state: "Uttar Pradesh", lat: 26.7606, lng: 83.3732, pin: "273", localities: ["Golghar", "Sahebganj", "Gita Press Road", "Rapti Nagar"] },
  { name: "Bareilly", state: "Uttar Pradesh", lat: 28.367, lng: 79.4304, pin: "243", localities: ["Kutubkhana", "Shyamganj", "Civil Lines", "CB Ganj"] },
  { name: "Noida", state: "Uttar Pradesh", lat: 28.5355, lng: 77.391, pin: "201", localities: ["Sector 18", "Phase 2", "Sector 63", "Greater Noida"] },
  { name: "Gurugram", state: "Haryana", lat: 28.4595, lng: 77.0266, pin: "122", localities: ["Sadar Bazar", "Udyog Vihar", "Sohna Road", "DLF Phase 3"], aliases: ["gurgaon"] },
  { name: "Faridabad", state: "Haryana", lat: 28.4089, lng: 77.3178, pin: "121", localities: ["NIT", "Ballabgarh", "Sector 37", "Old Faridabad"] },
  { name: "Jammu", state: "Jammu and Kashmir", lat: 32.7266, lng: 74.857, pin: "180", localities: ["Raghunath Bazar", "Gandhi Nagar", "Bari Brahmana", "Narwal Mandi"] },
  { name: "Goa", state: "Goa", lat: 15.4909, lng: 73.8278, pin: "403", localities: ["Panaji Market", "Margao", "Mapusa", "Verna"], aliases: ["panaji", "panjim"] },
  { name: "Solapur", state: "Maharashtra", lat: 17.6599, lng: 75.9064, pin: "413", localities: ["Navi Peth", "MIDC Akkalkot Road", "Mangalwar Peth"] },
  { name: "Kolhapur", state: "Maharashtra", lat: 16.705, lng: 74.2433, pin: "416", localities: ["Shahupuri", "Market Yard", "Rajarampuri", "Shiroli MIDC"] },
  { name: "Tiruchirappalli", state: "Tamil Nadu", lat: 10.7905, lng: 78.7047, pin: "620", localities: ["Gandhi Market", "Thillai Nagar", "Srirangam", "Big Bazaar Street"], aliases: ["trichy"] },
];

export function findCity(text: string): City | null {
  const t = ` ${text.toLowerCase().replace(/[^a-zऀ-ॿ ]+/g, " ")} `;
  let best: City | null = null;
  let bestLen = 0;
  for (const c of CITIES) {
    for (const n of [c.name.toLowerCase(), ...(c.aliases ?? [])]) {
      if (t.includes(` ${n} `) && n.length > bestLen) {
        best = c;
        bestLen = n.length;
      }
    }
  }
  return best;
}

export function cityByName(name: string | null | undefined): City | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === n || (c.aliases ?? []).includes(n)) ?? null;
}
