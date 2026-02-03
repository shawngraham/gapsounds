
import { WikiArticle, Location } from '../types';

export const getNearbyLandmarks = async (loc: Location): Promise<WikiArticle[]> => {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=5000&gslimit=15&gscoord=${loc.latitude}|${loc.longitude}&format=json&origin=*`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.query || !data.query.geosearch) {
    return [];
  }

  const articles: WikiArticle[] = data.query.geosearch;

  // Fetch extracts for each
  const pageIds = articles.map(a => a.pageid).join('|');
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${pageIds}&format=json&origin=*`;
  
  const extractResponse = await fetch(extractUrl);
  const extractData = await extractResponse.json();
  
  return articles.map(article => ({
    ...article,
    extract: extractData.query.pages[article.pageid]?.extract || 'No information available.'
  }));
};
