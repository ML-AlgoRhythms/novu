import { IntegrationRepository } from '@novu/dal';
import { ChannelTypeEnum, InAppProviderIdEnum } from '@novu/shared';
import { UserSession } from '@novu/testing';
import { expect } from 'chai';
import { createHash } from '../../shared/helpers/hmac.service';

describe('Initialize Session - /widgets/session/initialize (POST)', async () => {
  let session: UserSession;

  before(async () => {
    session = new UserSession();
    await session.initialize();
  });

  it('should create a valid app session for current widget user', async function () {
    const { body } = await session.testAgent
      .post('/v1/widgets/session/initialize')
      .send({
        applicationIdentifier: session.environment.identifier,
        subscriberId: '12345',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '054777777',
      })
      .expect(201);

    expect(body.data.token).to.be.ok;
    expect(body.data.profile._id).to.be.ok;
    expect(body.data.profile.firstName).to.equal('Test');
    expect(body.data.profile.phone).to.equal('054777777');
    expect(body.data.profile.lastName).to.equal('User');
  });

  it('should throw an error when an invalid environment Id passed', async function () {
    const { body } = await session.testAgent.post('/v1/widgets/session/initialize').send({
      applicationIdentifier: 'some-not-existing-id',
      subscriberId: '12345',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '054777777',
    });

    expect(body.message).to.contain('Please provide a valid app identifier');
  });

  it('should pass the test with valid HMAC hash', async function () {
    await setHmacConfig(session);
    const subscriberId = '12345';
    const secretKey = session.environment.apiKeys[0].key;

    const hmacHash = createHash(secretKey, subscriberId);
    const response = await initWidgetSession(subscriberId, session, hmacHash);

    expect(response.status).to.equal(201);
  });

  it('should fail the test with invalid subscriber id or invalid secret key', async function () {
    await setHmacConfig(session);
    const validSubscriberId = '12345';
    const validSecretKey = session.environment.apiKeys[0].key;
    let hmacHash;

    const invalidSubscriberId = validSubscriberId + '0';
    hmacHash = createHash(validSecretKey, invalidSubscriberId);

    const responseInvalidSubscriberId = await initWidgetSession(validSubscriberId, session, hmacHash);

    const invalidSecretKey = validSecretKey + '0';
    hmacHash = createHash(invalidSecretKey, validSubscriberId);
    const responseInvalidSecretKey = await initWidgetSession(validSubscriberId, session, hmacHash);

    expect(responseInvalidSubscriberId.body.message).to.contain('Please provide a valid HMAC hash');
    expect(responseInvalidSecretKey.body.message).to.contain('Please provide a valid HMAC hash');
  });
});

async function initWidgetSession(subscriberId: string, session, hmacHash?: string) {
  return await session.testAgent.post('/v1/widgets/session/initialize').send({
    applicationIdentifier: session.environment.identifier,
    subscriberId: subscriberId,
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '054777777',
    hmacHash: hmacHash,
  });
}

async function setHmacConfig(session: UserSession) {
  const integrationRepository = new IntegrationRepository();

  await integrationRepository.update(
    {
      _environmentId: session.environment._id,
      _organizationId: session.organization._id,
      providerId: InAppProviderIdEnum.Novu,
      channel: ChannelTypeEnum.IN_APP,
      active: true,
    },
    {
      $set: {
        'credentials.hmac': true,
      },
    }
  );
}
