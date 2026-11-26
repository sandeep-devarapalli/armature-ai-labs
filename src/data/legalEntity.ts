export const legalEntity = {
  name: "Armature Lab Spaces LLP",
  llpin: "ACB-2865",
  registeredOfficeAddress: [
    "677, 1st Floor, 27th Main Road, 13th Cross Road, Sector 1",
    "HSR Layout, HSR Layout Police Station, Bangalore South, Bangalore 560102, Karnataka, India"
  ],
  labAddress: {
    name: "Armature AI Lab, HSR 1490",
    street: "1490, 11th Cross, 20th Main Rd, 1st Sector",
    locality: "HSR Layout",
    city: "Bengaluru",
    postalCode: "560102",
    state: "Karnataka",
    country: "IN",
    get formatted(): string {
      return `${this.street}, ${this.locality}, ${this.city}, ${this.state} ${this.postalCode}`;
    }
  },
  email: "hello@armatureailabs.com",
  privacyEmail: "privacy@armatureailabs.com",
  phone: "+91 97484 85583",
  supportHours: "Monday to Friday, 10 am to 7 pm IST",
  grievanceOfficer: "Sandeep Devarapalli"
} as const;

export const policyUpdatedDate = "8 November 2026";
