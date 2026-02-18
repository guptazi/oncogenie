import { Amplify } from 'aws-amplify';

Amplify.configure({
  API: {
    REST: {
      OncoGenieAPI: {
        endpoint: process.env.REACT_APP_API_ENDPOINT || '',
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      },
    },
  },
});
