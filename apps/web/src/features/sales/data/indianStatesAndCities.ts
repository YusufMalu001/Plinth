/**
 * Indian States, Union Territories, and Major Cities Dataset
 */

export interface IndianState {
  id: string;
  name: string;
  code: string;
}

export const INDIAN_STATES: IndianState[] = [
  { id: 'Andhra Pradesh', name: 'Andhra Pradesh', code: 'AP' },
  { id: 'Arunachal Pradesh', name: 'Arunachal Pradesh', code: 'AR' },
  { id: 'Assam', name: 'Assam', code: 'AS' },
  { id: 'Bihar', name: 'Bihar', code: 'BR' },
  { id: 'Chandigarh', name: 'Chandigarh', code: 'CH' },
  { id: 'Chhattisgarh', name: 'Chhattisgarh', code: 'CG' },
  { id: 'Dadra and Nagar Haveli and Daman and Diu', name: 'Dadra & Nagar Haveli and Daman & Diu', code: 'DN' },
  { id: 'Delhi', name: 'Delhi (NCR)', code: 'DL' },
  { id: 'Goa', name: 'Goa', code: 'GA' },
  { id: 'Gujarat', name: 'Gujarat', code: 'GJ' },
  { id: 'Haryana', name: 'Haryana', code: 'HR' },
  { id: 'Himachal Pradesh', name: 'Himachal Pradesh', code: 'HP' },
  { id: 'Jammu and Kashmir', name: 'Jammu and Kashmir', code: 'JK' },
  { id: 'Jharkhand', name: 'Jharkhand', code: 'JH' },
  { id: 'Karnataka', name: 'Karnataka', code: 'KA' },
  { id: 'Kerala', name: 'Kerala', code: 'KL' },
  { id: 'Ladakh', name: 'Ladakh', code: 'LA' },
  { id: 'Madhya Pradesh', name: 'Madhya Pradesh', code: 'MP' },
  { id: 'Maharashtra', name: 'Maharashtra', code: 'MH' },
  { id: 'Manipur', name: 'Manipur', code: 'MN' },
  { id: 'Meghalaya', name: 'Meghalaya', code: 'ML' },
  { id: 'Mizoram', name: 'Mizoram', code: 'MZ' },
  { id: 'Nagaland', name: 'Nagaland', code: 'NL' },
  { id: 'Odisha', name: 'Odisha', code: 'OD' },
  { id: 'Puducherry', name: 'Puducherry', code: 'PY' },
  { id: 'Punjab', name: 'Punjab', code: 'PB' },
  { id: 'Rajasthan', name: 'Rajasthan', code: 'RJ' },
  { id: 'Sikkim', name: 'Sikkim', code: 'SK' },
  { id: 'Tamil Nadu', name: 'Tamil Nadu', code: 'TN' },
  { id: 'Telangana', name: 'Telangana', code: 'TS' },
  { id: 'Tripura', name: 'Tripura', code: 'TR' },
  { id: 'Uttar Pradesh', name: 'Uttar Pradesh', code: 'UP' },
  { id: 'Uttarakhand', name: 'Uttarakhand', code: 'UK' },
  { id: 'West Bengal', name: 'West Bengal', code: 'WB' },
];

export const INDIAN_CITIES_BY_STATE: Record<string, string[]> = {
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Kakinada',
    'Rajahmundry', 'Tirupati', 'Kadapa', 'Anantapur', 'Eluru', 'Vizianagaram',
    'Ongole', 'Nandyal', 'Machilipatnam', 'Adoni', 'Tenali', 'Proddatur', 'Chittoor', 'Hindupur'
  ],
  'Arunachal Pradesh': [
    'Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila', 'Roing', 'Tezu'
  ],
  'Assam': [
    'Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur',
    'Bongaigaon', 'Dhubri', 'Diphu', 'North Lakhimpur', 'Karimganj', 'Sivasagar', 'Goalpara'
  ],
  'Bihar': [
    'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga', 'Bihar Sharif',
    'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chhapra', 'Danapur', 'Saharsa', 'Sasaram',
    'Hajipur', 'Dehri', 'Siwan', 'Motihari', 'Nawada', 'Bagaha', 'Buxar', 'Kishanganj'
  ],
  'Chandigarh': [
    'Chandigarh'
  ],
  'Chhattisgarh': [
    'Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Rajnandgaon', 'Jagdalpur', 'Raigarh',
    'Ambikapur', 'Dhamtari', 'Mahasamund', 'Durg', 'Chirmiri'
  ],
  'Dadra and Nagar Haveli and Daman and Diu': [
    'Daman', 'Diu', 'Silvassa'
  ],
  'Delhi': [
    'New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi',
    'North East Delhi', 'North West Delhi', 'South East Delhi', 'South West Delhi', 'Shahdara',
    'Dwarka', 'Rohini', 'Connaught Place', 'Saket', 'Karol Bagh', 'Laxmi Nagar'
  ],
  'Goa': [
    'Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim', 'Curchorem', 'Cuncolim'
  ],
  'Gujarat': [
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh',
    'Gandhinagar', 'Anand', 'Navsari', 'Morbi', 'Nadiad', 'Surendranagar', 'Bharuch',
    'Mehsana', 'Bhuj', 'Porbandar', 'Palanpur', 'Valsad', 'Vapi', 'Gondal', 'Veraval',
    'Godhra', 'Patan', 'Kalol', 'Dahod', 'Botad', 'Amreli', 'Deesa', 'Jetpur', 'Ankleshwar'
  ],
  'Haryana': [
    'Gurugram (Gurgaon)', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak',
    'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Bhiwani', 'Sirsa', 'Bahadurgarh',
    'Jind', 'Thanesar', 'Kaithal', 'Rewari', 'Palwal', 'Hansi', 'Narnaul'
  ],
  'Himachal Pradesh': [
    'Shimla', 'Dharamshala', 'Solan', 'Mandi', 'Baddi', 'Kullu', 'Manali', 'Hamirpur',
    'Una', 'Bilaspur', 'Chamba', 'Paonta Sahib', 'Nahan'
  ],
  'Jammu and Kashmir': [
    'Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Kathua', 'Udhampur', 'Sopore',
    'Punch', 'Rajouri', 'Kupwara'
  ],
  'Jharkhand': [
    'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih',
    'Ramgarh', 'Medininagar', 'Chirkunda', 'Phusro', 'Chaibasa'
  ],
  'Karnataka': [
    'Bengaluru (Bangalore)', 'Mysuru (Mysore)', 'Hubballi-Dharwad', 'Mangaluru (Mangalore)',
    'Belagavi (Belgaum)', 'Kalaburagi (Gulbarga)', 'Davanagere', 'Ballari (Bellary)',
    'Vijayapura (Bijapur)', 'Shivamogga (Shimoga)', 'Tumakuru (Tumkur)', 'Raichur',
    'Bidar', 'Hosapete', 'Gadag-Betageri', 'Udupi', 'Hassan', 'Bhadravati', 'Chitradurga',
    'Kolar', 'Mandya', 'Chikkamagaluru', 'Gangavati', 'Bagalkote', 'Ranebennur'
  ],
  'Kerala': [
    'Thiruvananthapuram', 'Kochi (Cochin)', 'Kozhikode (Calicut)', 'Kollam', 'Thrissur',
    'Kannur', 'Alappuzha', 'Kottayam', 'Palakkad', 'Manjeri', 'Thalassery', 'Ponnani',
    'Vatakara', 'Kanhangad', 'Payyanur', 'Koyilandy', 'Neyyattinkara', 'Kayamkulam', 'Malappuram'
  ],
  'Ladakh': [
    'Leh', 'Kargil'
  ],
  'Madhya Pradesh': [
    'Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna',
    'Ratlam', 'Rewa', 'Katni', 'Singrauli', 'Burhanpur', 'Khandwa', 'Bhind', 'Chhindwara',
    'Guna', 'Shivpuri', 'Vidisha', 'Chhatarpur', 'Damoh', 'Mandsaur', 'Khargone', 'Neemuch',
    'Pithampur', 'Hoshangabad (Narmadapuram)', 'Itarsi', 'Sehore', 'Betul', 'Datia', 'Nagda'
  ],
  'Maharashtra': [
    'Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Kalyan-Dombivli', 'Vasai-Virar',
    'Aurangabad (Chhatrapati Sambhajinagar)', 'Navi Mumbai', 'Solapur', 'Mira-Bhayandar',
    'Bhiwandi', 'Amravati', 'Nanded', 'Kolhapur', 'Ulhasnagar', 'Sangli', 'Malegaon',
    'Jalgaon', 'Akola', 'Latur', 'Dhule', 'Ahmednagar', 'Chandrapur', 'Parbhani',
    'Ichalkaranji', 'Jalna', 'Ambarnath', 'Bhusawal', 'Panvel', 'Badlapur', 'Beed',
    'Gondia', 'Satara', 'Barshi', 'Yavatmal', 'Achalpur', 'Osmanabad (Dharashiv)', 'Nandurbar', 'Wardha'
  ],
  'Manipur': [
    'Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Kakching', 'Ukhrul'
  ],
  'Meghalaya': [
    'Shillong', 'Tura', 'Jowai', 'Nongstoin', 'Williamnagar'
  ],
  'Mizoram': [
    'Aizawl', 'Lunglei', 'Saiha', 'Champhai', 'Kolasib', 'Serchhip'
  ],
  'Nagaland': [
    'Dimapur', 'Kohima', 'Mokokchung', 'Tuensang', 'Wokha', 'Zunheboto'
  ],
  'Odisha': [
    'Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore',
    'Bhadrak', 'Baripada', 'Jharsuguda', 'Jeypore', 'Bargarh', 'Rayagada', 'Bolangir'
  ],
  'Puducherry': [
    'Puducherry (Pondicherry)', 'Ozhukarai', 'Karaikal', 'Mahe', 'Yanam'
  ],
  'Punjab': [
    'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali (SAS Nagar)',
    'Hoshiarpur', 'Pathankot', 'Moga', 'Abohar', 'Malerkotla', 'Khanna', 'Muktsar',
    'Barnala', 'Firozpur', 'Kapurthala', 'Phagwara', 'Rajpura', 'Zirakpur'
  ],
  'Rajasthan': [
    'Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur', 'Bhilwara', 'Alwar',
    'Bharatpur', 'Sikar', 'Pali', 'Sri Ganganagar', 'Kishangarh', 'Baran', 'Dhaulpur',
    'Tonk', 'Beawar', 'Hanumangarh', 'Gangapur City', 'Sawai Madhopur', 'Churu', 'Jhunjhunu'
  ],
  'Sikkim': [
    'Gangtok', 'Namchi', 'Geyzing', 'Mangan', 'Rangpo', 'Jorethang'
  ],
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Erode',
    'Tirunelveli', 'Vellore', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Ranipet', 'Sivakasi',
    'Karur', 'Udhagamandalam (Ooty)', 'Hosur', 'Nagercoil', 'Kanchipuram', 'Kumarapalayam',
    'Karaikkudi', 'Neyveli', 'Cuddalore', 'Kumbakonam', 'Tiruvannamalai', 'Pollachi', 'Rajapalayam'
  ],
  'Telangana': [
    'Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar', 'Ramagundam',
    'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet', 'Miryalaguda', 'Siddipet',
    'Jagtial', 'Mancherial', 'Kothagudem', 'Bodhan', 'Palwancha'
  ],
  'Tripura': [
    'Agartala', 'Dharmanagar', 'Udaipur', 'Kailashahar', 'Teliamura', 'Khowai', 'Belonia'
  ],
  'Uttar Pradesh': [
    'Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Meerut', 'Varanasi', 'Prayagraj (Allahabad)',
    'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Firozabad',
    'Jhansi', 'Muzaffarnagar', 'Mathura', 'Budaun', 'Rampur', 'Shahjahanpur', 'Farrukhabad',
    'Ayodhya (Faizabad)', 'Maunath Bhanjan (Mau)', 'Hapur', 'Etawah', 'Mirzapur', 'Bulandshahr',
    'Sambhal', 'Amroha', 'Hardoi', 'Fatehpur', 'Raebareli', 'Orai', 'Sitapur', 'Bahraich',
    'Modinagar', 'Unnao', 'Jaunpur', 'Lakhimpur', 'Hathras', 'Banda', 'Pilibhit', 'Barabanki', 'Greater Noida'
  ],
  'Uttarakhand': [
    'Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rudrapur', 'Kashipur', 'Rishikesh',
    'Kotdwar', 'Pithoragarh', 'Ramnagar', 'Kichha', 'Manglaur'
  ],
  'West Bengal': [
    'Kolkata', 'Howrah', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman', 'Malda',
    'Baharampur', 'Habra', 'Kharagpur', 'Shantipur', 'Dankuni', 'Dhulian', 'Ranaghat',
    'Haldia', 'Raiganj', 'Krishnanagar', 'Nabadwip', 'Medinipur', 'Jalpaiguri', 'Balurghat',
    'Basirhat', 'Bankura', 'Chakdaha', 'Darjeeling', 'Alipurduar', 'Purulia', 'Bangaon'
  ],
};

/**
 * Returns list of cities for a given state name or code
 */
export function getCitiesForState(stateIdentifier?: string): string[] {
  if (!stateIdentifier) return [];

  // Match by state name directly or by code
  const trimmed = stateIdentifier.trim().toLowerCase();
  const matchedState = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === trimmed || s.code.toLowerCase() === trimmed || s.id.toLowerCase() === trimmed
  );

  if (matchedState && INDIAN_CITIES_BY_STATE[matchedState.id]) {
    return INDIAN_CITIES_BY_STATE[matchedState.id];
  }

  // Fallback: check if direct key exists
  const directKey = Object.keys(INDIAN_CITIES_BY_STATE).find(
    (k) => k.toLowerCase() === trimmed
  );
  if (directKey) {
    return INDIAN_CITIES_BY_STATE[directKey];
  }

  return [];
}

export const STATE_OPTIONS = INDIAN_STATES.map((s) => ({
  id: s.name,
  name: s.name,
  code: s.code,
}));

export function getCityOptionsForState(stateIdentifier?: string) {
  const cities = getCitiesForState(stateIdentifier);
  return cities.map((city) => ({
    id: city,
    name: city,
  }));
}
