import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Country → State → District → Sub-district (tehsil/taluka/block) → City | Village → Locality */
export const LOCATION_TYPES = ['country', 'state', 'district', 'subdistrict', 'city', 'village', 'locality'];

/** Which parent types each type may sit under (international countries may skip levels). */
export const ALLOWED_PARENTS = {
  country: [],
  state: ['country'],
  district: ['state', 'country'],
  subdistrict: ['district'],
  city: ['subdistrict', 'district', 'state', 'country'],
  village: ['subdistrict', 'district'],
  locality: ['city', 'village', 'subdistrict', 'district'],
};

const locationSchema = new Schema(
  {
    type: { type: String, enum: LOCATION_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameLc: { type: String, required: true },
    aliases: [{ type: String, trim: true }], // spelling variants, local-script names, old names
    aliasesLc: [{ type: String }],
    slug: { type: String, required: true },
    countryCode: { type: String, uppercase: true, minlength: 2, maxlength: 2 },
    parentId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    ancestors: [{ type: Schema.Types.ObjectId }],
    path: { type: String }, // "Bagbahara, Mahasamund, Chhattisgarh, India"
    pinCodes: [{ type: String }],
    geo: { type: { type: String, enum: ['Point'] }, coordinates: { type: [Number], default: undefined } },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    source: { type: String, enum: ['admin', 'import', 'user_request'], default: 'admin' },
  },
  { timestamps: true }
);

locationSchema.index({ parentId: 1, type: 1, status: 1 });
locationSchema.index({ parentId: 1, slug: 1 }, { unique: true });
locationSchema.index({ ancestors: 1 });
locationSchema.index({ nameLc: 1 });
locationSchema.index({ aliasesLc: 1 });
locationSchema.index({ pinCodes: 1 });
locationSchema.index({ geo: '2dsphere' });

export const Location = mongoose.model('Location', locationSchema);
