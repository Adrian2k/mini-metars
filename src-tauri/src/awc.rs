use anyhow::{anyhow, bail};
use chrono::serde::ts_seconds;
use chrono::{DateTime, Utc};
use flate2::read::GzDecoder;
use log::debug;
use reqwest::Client;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::fmt;
use std::fmt::Formatter;
use std::io::Read;

const BASE_URL: &str = "https://aviationweather.gov/";
const MBAR_TO_INHG_FACTOR: f64 = 0.02953;

#[derive(Clone)]
pub struct AviationWeatherCenterApi {
    client: Client,
    stations: Option<HashMap<String, Station>>,
    faa_icao_lookup: Option<HashMap<String, String>>,
}

impl AviationWeatherCenterApi {
    pub async fn try_new() -> Result<Self, anyhow::Error> {
        let mut new = Self {
            client: Client::builder().build()?,
            stations: None,
            faa_icao_lookup: None,
        };

        new.update_stations().await?;
        Ok(new)
    }

    fn metars_json_url(airports_string: &str) -> String {
        format!("{BASE_URL}api/data/metar?ids={airports_string}&format=json")
    }

    pub async fn fetch_metar(&self, station_id: &str) -> Result<MetarDto, anyhow::Error> {
        if station_id.starts_with('@') || station_id.len() > 4 || station_id.contains(',') {
            bail!("Invalid station ID, must be a single ICAO or FAA ID")
        }

        let id_sanitized = self.sanitize_id(station_id);

        let metars = self
            .client
            .get(Self::metars_json_url(&id_sanitized))
            .send()
            .await?
            .json::<Vec<MetarDto>>()
            .await?;

        if metars.is_empty() {
            Err(anyhow!("No METARs found in result list"))
        } else {
            Ok(metars[0].clone())
        }
    }

    #[allow(dead_code)]
    pub async fn fetch_metars(
        &self,
        station_ids: &[&str],
    ) -> Result<Vec<MetarDto>, reqwest::Error> {
        let sanitized_ids = station_ids
            .iter()
            .map(|id| self.sanitize_id(id))
            .collect::<Vec<_>>();

        self.client
            .get(Self::metars_json_url(&sanitized_ids.join(",")))
            .send()
            .await?
            .json::<Vec<MetarDto>>()
            .await
    }

    pub async fn update_stations(&mut self) -> Result<HashMap<String, Station>, anyhow::Error> {
        let stations = self.fetch_stations_hashmap().await?;
        self.stations = Some(stations.clone());
        self.faa_icao_lookup = Some(
            stations
                .values()
                .filter_map(|s| {
                    s.faa_id
                        .as_ref()
                        .map(|faa| (faa.to_uppercase(), s.icao_id.to_uppercase()))
                })
                .collect(),
        );
        Ok(stations)
    }

    pub async fn fetch_stations(&self) -> Result<Vec<Station>, anyhow::Error> {
        let gzipped = self
            .client
            .get(format!("{BASE_URL}data/cache/stations.cache.json.gz"))
            .send()
            .await?
            .bytes()
            .await?;

        // AWC doesn't set a header that reqwest automatically catches, so need
        // to do manual GZIP decompression
        let read = &gzipped.into_iter().collect::<Vec<_>>()[..];
        let mut d = GzDecoder::new(read);
        let mut s = String::new();
        d.read_to_string(&mut s)?;

        let all: Vec<Station> = serde_json::from_str(&s)?;
        Ok(all.into_iter().filter(|s| !s.icao_id.is_empty()).collect())
    }

    pub async fn fetch_stations_hashmap(&self) -> Result<HashMap<String, Station>, anyhow::Error> {
        let stations = self.fetch_stations().await?;
        let map = stations
            .into_iter()
            .map(|s| (s.icao_id.to_uppercase(), s))
            .collect::<HashMap<_, _>>();
        Ok(map)
    }

    pub fn lookup_station(&self, lookup_id: &str) -> Result<Station, anyhow::Error> {
        let uppercase = lookup_id.to_uppercase();
        if let (Some(stations), Some(faa_icao_map)) = (&self.stations, &self.faa_icao_lookup) {
            if let Some(station) = stations.get(&uppercase) {
                Ok(station.clone())
            } else if let Some(id) = faa_icao_map.get(&uppercase) {
                stations.get(&id.to_uppercase()).map_or_else(
                    || Err(anyhow!("Error: inconsistency between FAA and ICAO data")),
                    |s| Ok(s.clone()),
                )
            } else {
                bail!("Error: could not find ID in ICAO or FAA lookups")
            }
        } else {
            bail!("Error: station data not initialized")
        }
    }

    fn sanitize_id(&self, id: &str) -> String {
        let ret = self
            .stations
            .as_ref()
            .map_or(id.to_uppercase(), |stations| {
                let id_is_state = id.starts_with('@') && id.len() == 3;
                let id_is_valid_icao = stations.contains_key(id);

                if id_is_state || id_is_valid_icao {
                    id.to_uppercase()
                } else if let Some(faa_icao_map) = &self.faa_icao_lookup {
                    faa_icao_map
                        .get(id)
                        .map_or_else(|| id.to_uppercase(), ToString::to_string)
                } else {
                    id.to_uppercase()
                }
            });
        debug!("Sanitized id for {id}: {ret}");

        ret
    }
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    #[serde(deserialize_with = "deserialize_null_string", default)]
    pub icao_id: String,
    pub iata_id: Option<String>,
    pub faa_id: Option<String>,
    pub wmo_id: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub elev: Option<i32>,
    pub site: Option<String>,
    pub state: String,
    pub country: Option<String>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetarDto {
    #[serde(rename = "icaoId")]
    pub icao_id: String,
    pub receipt_time: Option<String>,
    #[serde(deserialize_with = "ts_seconds::deserialize")]
    pub obs_time: DateTime<Utc>,
    pub report_time: Option<String>,
    pub temp: Option<f64>,
    pub dewp: Option<f64>,
    pub wdir: Option<StringOrI32>,
    pub wspd: Option<i32>,
    pub wgst: Option<i32>,
    pub visib: Option<StringOrF64>,
    pub altim: f64,
    pub slp: Option<f64>,
    pub qc_field: Option<i32>,
    pub wx_string: Option<String>,
    pub pres_tend: Option<f64>,
    pub max_t: Option<f64>,
    pub min_t: Option<f64>,
    pub max_t24: Option<f64>,
    pub min_t24: Option<f64>,
    pub precip: Option<f64>,
    pub pcp3hr: Option<f64>,
    pub pcp6hr: Option<f64>,
    pub pcp24hr: Option<f64>,
    pub snow: Option<f64>,
    pub vert_vis: Option<i32>,
    pub metar_type: String,
    pub raw_ob: String,
    pub most_recent: Option<i32>,
    pub lat: f64,
    pub lon: f64,
    pub elev: i32,
    pub prior: Option<i32>,
    pub name: String,
    pub clouds: Vec<Cloud>,
    pub cover: Option<String>,
    pub flt_cat: Option<String>,
}

impl MetarDto {
    pub fn altimeter_in_hg(&self) -> f64 {
        (self.altim * MBAR_TO_INHG_FACTOR * 100.0).round() / 100.0
    }

    pub const fn altimeter_hpa(&self) -> f64 {
        self.altim
    }

    pub fn wind_string(&self) -> String {
        if let (Some(wind_dir), Some(wind_spd)) = (&self.wdir, self.wspd) {
            let mut return_s = String::new();

            let dir_str = match wind_dir {
                StringOrI32::String(s) => s.to_string(),
                StringOrI32::I32(i) => format!("{i:03}"),
            };
            return_s.push_str(&dir_str);
            return_s.push_str(&format!("{wind_spd:02}"));
            if let Some(gusts) = self.wgst {
                return_s.push_str(&format!("G{gusts}"));
            }
            return_s.push_str("KT");

            return_s
        } else {
            String::new()
        }
    }
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cloud {
    pub cover: String,
    pub base: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrI32 {
    String(String),
    I32(i32),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StringOrF64 {
    String(String),
    F64(f64),
}

fn deserialize_null_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

impl fmt::Display for StringOrI32 {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match &self {
            Self::String(s) => write!(f, "{s}"),
            Self::I32(i) => write!(f, "{i}"),
        }
    }
}

impl fmt::Display for StringOrF64 {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match &self {
            Self::String(s) => write!(f, "{s}"),
            Self::F64(i) => write!(f, "{i}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metar_dto_deserialization() {
        let json = r#"[{"icaoId":"ENGM","receiptTime":"2026-03-11T15:26:07.891Z","obsTime":1773242400,"reportTime":"2026-03-11T15:20:00.000Z","temp":3,"dewp":2,"wdir":180,"wspd":8,"visib":4.97,"altim":998,"qcField":0,"wxString":"-RA","metarType":"METAR","rawOb":"METAR ENGM 111520Z 18008KT 8000 -RA OVC002 03/02 Q0998 TEMPO 2000 BR","lat":60.201,"lon":11.08,"elev":204,"name":"Oslo/Gardermoen Arpt, AK, NO","cover":"OVC","clouds":[{"cover":"OVC","base":200}],"fltCat":"LIFR"}]"#;
        let result: Result<Vec<MetarDto>, _> = serde_json::from_str(json);
        match &result {
            Ok(metars) => println!("SUCCESS: parsed {} metar(s), altim={}", metars.len(), metars[0].altim),
            Err(e) => println!("FAILED: {e}"),
        }
        assert!(result.is_ok(), "Deserialization failed: {:?}", result.err());
    }

    #[test]
    fn test_station_deserialization_with_null_fields() {
        // Non-US station has null faaId, iataId, wmoId; some stations have null country/elev/priority
        let json = r#"[{"id":"ENGM","icaoId":"ENGM","iataId":"OSL","faaId":null,"wmoId":"01384","site":"Oslo/Gardermoen Arpt","lat":60.201,"lon":11.08,"elev":204,"state":"AK","country":"NO","priority":1,"siteType":["METAR","TAF"]},{"id":"TEST","icaoId":"TEST","iataId":null,"faaId":null,"wmoId":null,"site":"Test Station","lat":0.0,"lon":0.0,"elev":null,"state":"","country":null,"priority":null,"siteType":["METAR"]},{"id":"41001","icaoId":null,"iataId":null,"faaId":null,"wmoId":null,"site":"Cape Hatteras","lat":34.561,"lon":-72.631,"elev":0,"state":"","country":null,"priority":1,"siteType":[]}]"#;
        let result: Result<Vec<Station>, _> = serde_json::from_str(json);
        match &result {
            Ok(stations) => println!("SUCCESS: parsed {} station(s), icaoId={}", stations.len(), stations[0].icao_id),
            Err(e) => println!("FAILED: {e}"),
        }
        assert!(result.is_ok(), "Station deserialization failed: {:?}", result.err());
        let stations = result.unwrap();
        // 3 stations deserialized, including one with null icaoId
        assert_eq!(stations.len(), 3);
        assert_eq!(stations[0].faa_id, None);
        assert_eq!(stations[0].iata_id, Some("OSL".to_string()));
        // Second station has null country, elev, priority
        assert_eq!(stations[1].country, None);
        assert_eq!(stations[1].elev, None);
        assert_eq!(stations[1].priority, None);
        // Third station has null icaoId, deserialized as empty string
        assert_eq!(stations[2].icao_id, "");
    }

    #[tokio::test]
    async fn test_fetch_real_station_cache() {
        let client = reqwest::Client::builder().build().unwrap();
        let gzipped = client
            .get("https://aviationweather.gov/data/cache/stations.cache.json.gz")
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();

        let read = &gzipped.into_iter().collect::<Vec<_>>()[..];
        let mut d = flate2::read::GzDecoder::new(read);
        let mut s = String::new();
        d.read_to_string(&mut s).unwrap();

        let result: Result<Vec<Station>, _> = serde_json::from_str(&s);
        match &result {
            Ok(stations) => {
                let with_icao = stations.iter().filter(|s| !s.icao_id.is_empty()).count();
                println!("SUCCESS: parsed {} total stations, {} with icaoId", stations.len(), with_icao);
            }
            Err(e) => println!("FAILED at: {e}"),
        }
        assert!(result.is_ok(), "Real station cache deserialization failed: {:?}", result.err());
    }

    #[tokio::test]
    async fn test_fetch_real_metar() {
        let client = reqwest::Client::builder().build().unwrap();
        let body = client
            .get("https://aviationweather.gov/api/data/metar?ids=ENGM&format=json")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();

        println!("Raw METAR response: {}", &body[..body.len().min(500)]);
        let result: Result<Vec<MetarDto>, _> = serde_json::from_str(&body);
        match &result {
            Ok(metars) => println!("SUCCESS: parsed {} metar(s)", metars.len()),
            Err(e) => println!("FAILED at: {e}"),
        }
        assert!(result.is_ok(), "Real METAR deserialization failed: {:?}", result.err());
    }
}
