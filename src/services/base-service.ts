import { Provider } from '@nestjs/common';
import { AppService } from './app.service';

const services: Provider[] = [AppService];
export default services;
